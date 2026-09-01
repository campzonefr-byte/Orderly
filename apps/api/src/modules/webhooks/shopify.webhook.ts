import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  OrderStatus,
  FinancialStatus,
  FulfillmentStatus,
} from '@prisma/client';

@Injectable()
export class ShopifyWebhook {
  constructor(private prisma: PrismaService) {}

  async handleOrderCreate(storeId: string, payload: any) {
    const order = await this.upsertOrder(storeId, payload);
    // Detect loyal customer for this phone (non-blocking)
    this.tagLoyalForPhone(payload.customer?.phone ?? payload.shipping_address?.phone).catch(() => {});
    return order;
  }

  private async tagLoyalForPhone(rawPhone?: string | null) {
    if (!rawPhone) return;
    const TAG = 'Client fidèle';
    const SIX_HOURS = 6 * 60 * 60 * 1000;
    const phone = rawPhone.replace(/\s|\+216/g, '');
    if (phone.length < 6) return;

    const all = await this.prisma.order.findMany({
      where: { customerPhone: { not: null } },
      select: { id: true, customerPhone: true, sourceCreatedAt: true, tags: true, orderStatus: true },
      orderBy: { sourceCreatedAt: 'asc' },
    });

    const mine = all.filter(
      (o) =>
        (o.customerPhone ?? '').replace(/\s|\+216/g, '') === phone &&
        o.orderStatus !== 'ANNULE' &&
        o.orderStatus !== 'ARCHIVE',
    );

    if (mine.length < 2) return;

    const first = new Date(mine[0].sourceCreatedAt).getTime();
    const hasLateOrder = mine.some(
      (o) => new Date(o.sourceCreatedAt).getTime() - first >= SIX_HOURS,
    );
    if (!hasLateOrder) return;

    for (const o of mine) {
      if (o.tags.includes(TAG)) continue;
      await this.prisma.order.update({
        where: { id: o.id },
        data: { tags: { set: [...o.tags, TAG] } },
      });
    }
  }

  async handleOrderUpdate(storeId: string, payload: any) {
    return this.upsertOrder(storeId, payload);
  }

  async handleOrderCancelled(storeId: string, payload: any) {
    const order = await this.prisma.order.findUnique({
      where: {
        storeId_externalOrderId: {
          storeId,
          externalOrderId: String(payload.id),
        },
      },
      include: { lineItems: true },
    });
    if (!order) return;

    await this.prisma.order.update({
      where: { id: order.id },
      data: {
        orderStatus: 'ANNULE',
        fulfillmentStatus: 'CANCELLED',
        financialStatus: 'VOIDED',
      },
    });

    await this.prisma.orderEvent.create({
      data: {
        orderId: order.id,
        eventType: 'webhook_received',
        payload: { topic: 'orders/cancelled' },
        actor: 'system:shopify-webhook',
      },
    });

    // Restock line items
    for (const lineItem of order.lineItems) {
      if (!lineItem.sku) continue;
      const product = await this.prisma.product.findUnique({
        where: { storeId_sku: { storeId, sku: lineItem.sku } },
      });
      if (!product) continue;
      await this.prisma.product.update({
        where: { id: product.id },
        data: { quantityAvailable: product.quantityAvailable + lineItem.quantity },
      });
    }
  }

  async handleFulfillmentCreate(storeId: string, payload: any) {
    const order = await this.prisma.order.findUnique({
      where: {
        storeId_externalOrderId: {
          storeId,
          externalOrderId: String(payload.order_id),
        },
      },
      include: { lineItems: true },
    });
    if (!order) return;

    await this.prisma.fulfillment.create({
      data: {
        orderId: order.id,
        carrier: payload.tracking_company ?? null,
        trackingNumber: payload.tracking_number ?? null,
        trackingUrl: payload.tracking_url ?? null,
        status: payload.status ?? 'pending',
        deliveryPartnerRef: String(payload.id),
      },
    });

    await this.prisma.order.update({
      where: { id: order.id },
      data: {
        fulfillmentStatus: 'FULFILLED',
        orderStatus: 'A_EXPEDIER',
      },
    });

    // Decrement stock
    for (const lineItem of order.lineItems) {
      if (!lineItem.sku) continue;
      const product = await this.prisma.product.findUnique({
        where: { storeId_sku: { storeId, sku: lineItem.sku } },
      });
      if (!product) continue;

      const newQty = Math.max(0, product.quantityAvailable - lineItem.quantity);
      await this.prisma.product.update({
        where: { id: product.id },
        data: { quantityAvailable: newQty },
      });

      if (newQty <= product.lowStockThreshold) {
        await this.prisma.stockAlert.create({
          data: {
            productId: product.id,
            thresholdAtTrigger: product.lowStockThreshold,
          },
        });
      }
    }
  }

  async handleRefundCreate(storeId: string, payload: any) {
    const order = await this.prisma.order.findUnique({
      where: {
        storeId_externalOrderId: {
          storeId,
          externalOrderId: String(payload.order_id),
        },
      },
      include: { lineItems: true },
    });
    if (!order) return;

    const amount = payload.transactions?.reduce(
      (sum: number, t: any) => sum + parseFloat(t.amount ?? 0),
      0
    ) ?? 0;

    const totalRefunded = Number(order.totalRefunded) + amount;
    const financialStatus: FinancialStatus =
      totalRefunded >= Number(order.total) ? 'REFUNDED' : 'PARTIALLY_REFUNDED';

    await this.prisma.$transaction([
      this.prisma.refund.create({
        data: {
          orderId: order.id,
          amount,
          reason: payload.note ?? 'Shopify refund',
        },
      }),
      this.prisma.order.update({
        where: { id: order.id },
        data: { totalRefunded, financialStatus },
      }),
    ]);

    // Restock refunded items
    if (payload.refund_line_items) {
      for (const rli of payload.refund_line_items) {
        const lineItem = order.lineItems.find(
          (li) => li.id === String(rli.line_item_id)
        );
        if (!lineItem?.sku) continue;
        const product = await this.prisma.product.findUnique({
          where: { storeId_sku: { storeId, sku: lineItem.sku } },
        });
        if (!product) continue;
        await this.prisma.product.update({
          where: { id: product.id },
          data: { quantityAvailable: product.quantityAvailable + rli.quantity },
        });
      }
    }
  }

  private async upsertOrder(storeId: string, payload: any) {
    try {
      return await this.doUpsertOrder(storeId, payload);
    } catch (e: any) {
      // Race condition: another webhook created the order first — retry as update
      if (e?.code === 'P2002') {
        try {
          return await this.doUpsertOrder(storeId, payload);
        } catch (retryError: any) {
          console.warn(
            `[shopify-webhook] upsert failed twice for order ${payload.id}:`,
            retryError?.code ?? retryError?.message,
          );
          return null;
        }
      }
      throw e;
    }
  }

  private async doUpsertOrder(storeId: string, payload: any) {
    const financialStatus = this.mapFinancialStatus(payload.financial_status);
    const fulfillmentStatus = this.mapFulfillmentStatus(payload.fulfillment_status);
    const orderStatus = this.deriveOrderStatus(financialStatus, fulfillmentStatus);

    const rawItems = payload.line_items ?? [];
    const lineItems: any[] = [];

    for (const li of rawItems) {
      const sku = li.sku ?? null;
      const title = li.title ?? '';

      // Resolve the matching product by SKU, name, or alias
      let productId: string | null = null;

      if (sku) {
        const bySku = await this.prisma.product.findUnique({
          where: { storeId_sku: { storeId, sku } },
          select: { id: true },
        });
        if (bySku) productId = bySku.id;
      }

      if (!productId && title) {
        const byName = await this.prisma.product.findFirst({
          where: { storeId, name: { equals: title, mode: 'insensitive' } },
          select: { id: true },
        });
        if (byName) productId = byName.id;
      }

      if (!productId && title) {
        const alias = await this.prisma.productAlias.findFirst({
          where: {
            alias: { equals: title, mode: 'insensitive' },
            product: { storeId },
          },
          select: { productId: true },
        });
        if (alias) productId = alias.productId;
      }

      lineItems.push({
        sku,
        title,
        variantTitle: li.variant_title ?? null,
        quantity: li.quantity,
        fulfilledQty: li.fulfillable_quantity
          ? li.quantity - li.fulfillable_quantity
          : 0,
        refundedQty: 0,
        price: parseFloat(li.price),
        ...(productId && { productId }),
      });
    }

    return this.prisma.order.upsert({
      where: {
        storeId_externalOrderId: {
          storeId,
          externalOrderId: String(payload.id),
        },
      },
      update: {
        financialStatus,
        fulfillmentStatus,
        // Ne pas écraser le statut si l'équipe l'a déjà traité
        updatedAt: new Date(),
      },
      create: {
        storeId,
        externalOrderId: String(payload.id),
        orderNumber: payload.name,
        financialStatus,
        fulfillmentStatus,
        orderStatus,
        customerName: payload.customer
          ? `${payload.customer.first_name} ${payload.customer.last_name}`.trim()
          : null,
        customerEmail: payload.customer?.email ?? null,
        customerPhone: payload.customer?.phone ?? null,
        shippingAddress: payload.shipping_address ?? null,
        billingAddress: payload.billing_address ?? null,
        currency: payload.currency,
        subtotal: parseFloat(payload.subtotal_price),
        taxTotal: parseFloat(payload.total_tax),
        shippingTotal: parseFloat(payload.shipping_lines?.[0]?.price ?? '0'),
        total: parseFloat(payload.total_price),
        totalRefunded: 0,
        tags: payload.tags ? payload.tags.split(', ').filter(Boolean) : [],
        notes: payload.note ?? null,
        sourceCreatedAt: new Date(payload.created_at),
        lineItems: { create: lineItems },
      },
    });
  }

  private mapFinancialStatus(status: string): FinancialStatus {
    const map: Record<string, FinancialStatus> = {
      pending: 'PENDING',
      authorized: 'AUTHORIZED',
      partially_paid: 'PARTIALLY_PAID',
      paid: 'PAID',
      partially_refunded: 'PARTIALLY_REFUNDED',
      refunded: 'REFUNDED',
      voided: 'VOIDED',
    };
    return map[status] ?? 'PENDING';
  }

  private mapFulfillmentStatus(status: string | null): FulfillmentStatus {
    if (!status) return 'UNFULFILLED';
    const map: Record<string, FulfillmentStatus> = {
      fulfilled: 'FULFILLED',
      partial: 'PARTIAL',
      restocked: 'RESTOCKED',
    };
    return map[status] ?? 'UNFULFILLED';
  }

  private deriveOrderStatus(
    financial: FinancialStatus,
    fulfillment: FulfillmentStatus,
  ): OrderStatus {
    if (financial === 'VOIDED') return 'ANNULE';
    if (financial === 'REFUNDED') return 'RETOUR';
    if (fulfillment === 'FULFILLED') return 'A_EXPEDIER';
    if (fulfillment === 'PARTIAL') return 'EN_PREPARATION';
    if (financial === 'PAID') return 'CONFIRME';
    return 'NOUVEAU';
  }
}