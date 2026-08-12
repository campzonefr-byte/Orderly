import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { OrderStatus, FinancialStatus, FulfillmentStatus, Prisma } from '@prisma/client';
import { CosmosService } from '../delivery/cosmos.service';
@Injectable()
export class OrdersService {
  constructor(
    private prisma: PrismaService,
    private cosmos: CosmosService,
  ) {}

  async findAll(query: {
    storeIds?: string[];
    orderStatus?: OrderStatus[];
    financialStatus?: FinancialStatus[];
    fulfillmentStatus?: FulfillmentStatus[];
    search?: string;
    page?: number;
    pageSize?: number;
  }) {
    const {
      storeIds,
      orderStatus,
      financialStatus,
      fulfillmentStatus,
      search,
      page = 1,
      pageSize = 25,
    } = query;

    const where: Prisma.OrderWhereInput = {
      ...(storeIds?.length && { storeId: { in: storeIds } }),
      ...(orderStatus?.length && { orderStatus: { in: orderStatus } }),
      ...(financialStatus?.length && { financialStatus: { in: financialStatus } }),
      ...(fulfillmentStatus?.length && { fulfillmentStatus: { in: fulfillmentStatus } }),
      ...(search && {
        OR: [
          { orderNumber: { contains: search, mode: 'insensitive' } },
          { customerName: { contains: search, mode: 'insensitive' } },
          { customerEmail: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };

    const [orders, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        include: {
          lineItems: true,
          fulfillments: { orderBy: { createdAt: 'desc' }, take: 1 },
          store: { select: { name: true } },
        },
        orderBy: { sourceCreatedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.order.count({ where }),
    ]);

    return {
      orders: orders.map((o) => ({
        ...o,
        storeName: o.store.name,
        trackingNumber: o.fulfillments[0]?.trackingNumber ?? null,
        carrier: o.fulfillments[0]?.carrier ?? null,
        itemCount: o.lineItems.reduce((s, li) => s + li.quantity, 0),
        callAttempts: (o.callAttempts as any[]) ?? [],
      })),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  async findOne(id: string) {
    const o = await this.prisma.order.findUnique({
      where: { id },
      include: {
        lineItems: true,
        fulfillments: true,
        refunds: true,
        events: { orderBy: { createdAt: 'desc' } },
        store: { select: { name: true } },
      },
    });
    if (!o) return null;
    return {
      ...o,
      storeName: o.store.name,
      callAttempts: (o.callAttempts as any[]) ?? [],
    };
  }

  async createManual(data: any, actorId: string) {
    const orderNumber = `#M${Date.now().toString().slice(-6)}`;
    let agentName: string | null = null;
    if (actorId) {
      const user = await this.prisma.user.findUnique({
        where: { id: actorId },
        select: { name: true },
      });
      agentName = user?.name ?? null;
    }
    const order = await this.prisma.order.create({
      data: {
        assignedAgentName: agentName,
        storeId: data.storeId,
        externalOrderId: `manual_${Date.now()}`,
        orderNumber,
        financialStatus: 'PENDING',
        fulfillmentStatus: 'UNFULFILLED',
        orderStatus: data.orderStatus ?? 'NOUVEAU',
        customerName: data.customerName ?? null,
        customerPhone: data.customerPhone ?? null,
        shippingAddress: data.shippingAddress ?? null,
        currency: data.currency ?? 'TND',
        subtotal: data.subtotal ?? 0,
        taxTotal: 0,
        shippingTotal: 0,
        total: data.total ?? 0,
        totalRefunded: 0,
        tags: data.tags?.length ? data.tags : [data.source ?? 'manual'],
        assignedAgentId: actorId ?? null,
        deliveryCompany: data.deliveryCompany ?? null,
        sourceCreatedAt: new Date(),
        lineItems: {
          create: (data.lineItems ?? []).map((li: any) => ({
            title: li.title,
            sku: li.sku ?? null,
            quantity: li.quantity,
            price: li.price ?? 0,
            fulfilledQty: 0,
            refundedQty: 0,
          })),
        },
      },
    });

    await this.prisma.orderEvent.create({
      data: {
        orderId: order.id,
        eventType: 'order_created_manual',
        payload: { source: data.source ?? 'manual' },
        actor: actorId,
      },
    });

    return order;
  }
  async getOrderEvents(orderId: string) {
    const events = await this.prisma.orderEvent.findMany({
      where: { orderId },
      orderBy: { createdAt: 'desc' },
    });
  
    // Resolve actor names
    const actorIds = [...new Set(events.map((e) => e.actor).filter(Boolean))] as string[];
    const users = await this.prisma.user.findMany({
      where: { id: { in: actorIds } },
      select: { id: true, name: true, email: true },
    });
    const userMap = Object.fromEntries(users.map((u) => [u.id, u]));
  
    return events.map((e) => ({
      ...e,
      actorName: e.actor ? (userMap[e.actor]?.name ?? e.actor) : 'Système',
      actorEmail: e.actor ? userMap[e.actor]?.email : null,
    }));
  }
  async createExchange(
    originalOrderId: string,
    data: {
      itemsToRecover: { title: string; sku?: string; variantTitle?: string; quantity: number }[];
      itemsToSend: { title: string; sku?: string; variantTitle?: string; quantity: number; price?: number }[];
      priceDifference?: number;
      reason: string;
      deliveryCompany?: string;
    },
    actorId: string,
  ) {
    const original = await this.prisma.order.findUnique({
      where: { id: originalOrderId },
      include: { lineItems: true },
    });
    if (!original) throw new Error('Original order not found');
  
    const diff = data.priceDifference ?? 0;
    const exchangeNumber = `#E-${original.orderNumber.replace('#', '')}`;
  
    // Store exchange metadata in internalNote as JSON
    const exchangeMeta = {
      exchange: {
        originalOrderId,
        originalOrderNumber: original.orderNumber,
        itemsToRecover: data.itemsToRecover,
        reason: data.reason,
        createdAt: new Date().toISOString(),
      },
    };
  
    const exchangeOrder = await this.prisma.order.create({
      data: {
        storeId: original.storeId,
        externalOrderId: `exchange_${Date.now()}`,
        orderNumber: exchangeNumber,
        financialStatus: 'PENDING',
        fulfillmentStatus: 'UNFULFILLED',
        orderStatus: 'ECHANGE',
        customerName: original.customerName,
        customerPhone: original.customerPhone,
        customerPhone2: original.customerPhone2,
        customerEmail: original.customerEmail,
        shippingAddress: original.shippingAddress ?? undefined,
        currency: original.currency,
        subtotal: diff,
        taxTotal: 0,
        shippingTotal: 0,
        total: diff,
        totalRefunded: 0,
        tags: ['Échange'],
        internalNote: JSON.stringify(exchangeMeta),
        deliveryCompany: data.deliveryCompany ?? original.deliveryCompany,
        sourceCreatedAt: new Date(),
        lineItems: {
          create: data.itemsToSend.map((li) => ({
            title: li.title,
            sku: li.sku ?? null,
            variantTitle: li.variantTitle ?? null,
            quantity: li.quantity,
            price: li.price ?? 0,
            fulfilledQty: 0,
            refundedQty: 0,
          })),
        },
      },
      include: { lineItems: true },
    });
  
    // Tag original order
    const originalTags = original.tags.includes('Échange')
      ? original.tags
      : [...original.tags, 'Échange'];
  
    await this.prisma.order.update({
      where: { id: originalOrderId },
      data: { tags: originalTags },
    });
  
    await this.prisma.orderEvent.create({
      data: {
        orderId: exchangeOrder.id,
        eventType: 'exchange_created',
        payload: {
          originalOrderNumber: original.orderNumber,
          reason: data.reason,
          priceDifference: diff,
        },
        actor: actorId,
      },
    });
  
    await this.prisma.orderEvent.create({
      data: {
        orderId: originalOrderId,
        eventType: 'exchange_requested',
        payload: {
          exchangeOrderNumber: exchangeNumber,
          reason: data.reason,
        },
        actor: actorId,
      },
    });
  
    return exchangeOrder;
  }
  
  // Restock recovered items when exchange is delivered
  async restockExchangeItems(orderId: string, actorId: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order?.internalNote) return { restocked: 0 };
  
    let meta: any = {};
    try { meta = JSON.parse(order.internalNote); } catch { return { restocked: 0 }; }
    if (!meta.exchange?.itemsToRecover) return { restocked: 0 };
  
    let restocked = 0;
    for (const item of meta.exchange.itemsToRecover) {
      if (!item.sku) continue;
      const product = await this.prisma.product.findUnique({
        where: { storeId_sku: { storeId: order.storeId, sku: item.sku } },
      });
      if (!product) continue;
  
      const before = product.quantityAvailable;
      const after = before + item.quantity;
  
      await this.prisma.product.update({
        where: { id: product.id },
        data: { quantityAvailable: after },
      });
  
      await this.prisma.inventoryLog.create({
        data: {
          productId: product.id,
          type: 'EXCHANGE_RETURN',
          quantityChange: item.quantity,
          quantityBefore: before,
          quantityAfter: after,
          note: `Retour échange — commande ${order.orderNumber}`,
          actor: actorId,
        },
      });
      restocked++;
    }
  
    return { restocked };
  }
  async detectLoyalCustomers() {
    const TAG = 'Client fidèle';
    const SIX_HOURS = 6 * 60 * 60 * 1000;
  
    // Get all orders with a phone, sorted by date
    const orders = await this.prisma.order.findMany({
      where: { customerPhone: { not: null } },
      select: {
        id: true,
        customerPhone: true,
        sourceCreatedAt: true,
        tags: true,
        orderStatus: true,
      },
      orderBy: { sourceCreatedAt: 'asc' },
    });
  
    // Group by phone
    const byPhone: Record<string, typeof orders> = {};
    for (const o of orders) {
      const phone = (o.customerPhone ?? '').replace(/\s|\+216/g, '');
      if (!phone || phone.length < 6) continue;
      if (!byPhone[phone]) byPhone[phone] = [];
      byPhone[phone].push(o);
    }
  
    const toTag: string[] = [];
    const toUntag: string[] = [];
  
    for (const phone of Object.keys(byPhone)) {
      const list = byPhone[phone];
      // Ignore cancelled/archived when counting real orders
      const valid = list.filter(
        (o) => o.orderStatus !== 'ANNULE' && o.orderStatus !== 'ARCHIVE',
      );
  
      if (valid.length < 2) {
        // Not loyal — remove tag if present
        list.forEach((o) => {
          if (o.tags.includes(TAG)) toUntag.push(o.id);
        });
        continue;
      }
  
      const first = new Date(valid[0].sourceCreatedAt).getTime();
  
      // Find orders placed at least 6h after the first one
      const loyal = valid.filter(
        (o) => new Date(o.sourceCreatedAt).getTime() - first >= SIX_HOURS,
      );
  
      if (loyal.length === 0) {
        // All orders within 6h — likely a duplicate, not loyal
        list.forEach((o) => {
          if (o.tags.includes(TAG)) toUntag.push(o.id);
        });
        continue;
      }
  
      // Tag ALL orders of this customer (first one included)
      valid.forEach((o) => {
        if (!o.tags.includes(TAG)) toTag.push(o.id);
      });
    }
  
    // Apply — add tag
    for (const id of toTag) {
      const order = orders.find((o) => o.id === id);
      if (!order) continue;
      await this.prisma.order.update({
        where: { id },
        data: { tags: { set: [...order.tags, TAG] } },
      });
    }
  
    // Apply — remove tag
    for (const id of toUntag) {
      const order = orders.find((o) => o.id === id);
      if (!order) continue;
      await this.prisma.order.update({
        where: { id },
        data: { tags: { set: order.tags.filter((t) => t !== TAG) } },
      });
    }
  
    return {
      tagged: toTag.length,
      untagged: toUntag.length,
      loyalCustomers: Object.keys(byPhone).filter((p) => {
        const valid = byPhone[p].filter(
          (o) => o.orderStatus !== 'ANNULE' && o.orderStatus !== 'ARCHIVE',
        );
        if (valid.length < 2) return false;
        const first = new Date(valid[0].sourceCreatedAt).getTime();
        return valid.some(
          (o) => new Date(o.sourceCreatedAt).getTime() - first >= SIX_HOURS,
        );
      }).length,
    };
  }
  async updateOrder(
    orderId: string,
    data: any,
    actorId: string,
  ) {
    const existing = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!existing) throw new Error('Order not found');

    let subtotal = Number(existing.subtotal);
    if (data.lineItems) {
      subtotal = data.lineItems.reduce((s: number, li: any) => s + li.price * li.quantity, 0);
    }

    const updated = await this.prisma.order.update({
      where: { id: orderId },
      data: {
        ...(data.customerName !== undefined && { customerName: data.customerName }),
        ...(data.customerPhone !== undefined && { customerPhone: data.customerPhone }),
        ...(data.customerPhone2 !== undefined && { customerPhone2: data.customerPhone2 }),
        ...(data.shippingAddress !== undefined && { shippingAddress: data.shippingAddress }),
        ...(data.internalNote !== undefined && { internalNote: data.internalNote }),
        ...(data.deliveryCompany !== undefined && { deliveryCompany: data.deliveryCompany }),
        ...(data.scheduledDeliveryDate !== undefined && {
          scheduledDeliveryDate: data.scheduledDeliveryDate ? new Date(data.scheduledDeliveryDate) : null,
        }),
        ...(data.tags !== undefined && { tags: data.tags }),
        ...(data.lineItems && {
          subtotal,
          total: subtotal + Number(existing.taxTotal) + Number(existing.shippingTotal),
          lineItems: {
            deleteMany: {},
            create: data.lineItems.map((li: any) => ({
              title: li.title,
              sku: li.sku ?? null,
              variantTitle: li.variantTitle ?? null,
              quantity: li.quantity,
              price: li.price,
              fulfilledQty: 0,
              refundedQty: 0,
            })),
          },
        }),
      },
      include: { lineItems: true },
    });

    await this.prisma.orderEvent.create({
      data: {
        orderId,
        eventType: 'order_edited',
        payload: { fields: Object.keys(data) },
        actor: actorId,
      },
    });

    return updated;
  }

  async updateStatus(
    orderId: string,
    status: OrderStatus,
    actorId: string,
    extra?: { reason?: string; note?: string },
  ) {
    // Resolve agent name
    let agentName: string | null = null;
    if (actorId) {
      const user = await this.prisma.user.findUnique({
        where: { id: actorId },
        select: { name: true },
      });
      agentName = user?.name ?? null;
    }

    // Assign agent on confirmation-related statuses
    const assignStatuses: OrderStatus[] = [
      'CONFIRME', 'A_PREPARER', 'ECHANGE', 'ANNULE', 'CONFIRMATION_EN_COURS',
    ];
    const shouldAssign = assignStatuses.includes(status);
    const isConfirmed = status === 'A_PREPARER' || status === 'CONFIRME' || status === 'ECHANGE';

    const order = await this.prisma.order.update({
      where: { id: orderId },
      data: {
        orderStatus: status,
        ...(extra?.reason && { cancellationReason: extra.reason }),
        ...(extra?.note && { cancellationNote: extra.note }),
        ...(shouldAssign && actorId && {
          assignedAgentId: actorId,
          assignedAgentName: agentName,
        }),
        ...(isConfirmed && { confirmedAt: new Date() }),
      },
    });

    await this.prisma.orderEvent.create({
      data: {
        orderId,
        eventType: 'status_changed',
        payload: { to: status, reason: extra?.reason },
        actor: actorId,
      },
    });

    // Auto-create shipment at courier when order is printed
    if (status === 'EN_PREPARATION' && order.deliveryCompany === 'Cosmos') {
      this.cosmos.createShipment(orderId, actorId).catch((e) => {
        console.warn('[cosmos] shipment creation failed:', e?.message);
      });
    }

    return order;
  }

  async updateCallAttempts(orderId: string, callAttempts: any[]) {
    return this.prisma.order.update({
      where: { id: orderId },
      data: { callAttempts },
    });
  }

  async updateTags(orderId: string, tags: string[], actorId: string) {
    const updated = await this.prisma.order.update({
      where: { id: orderId },
      data: { tags },
    });

    await this.prisma.orderEvent.create({
      data: {
        orderId,
        eventType: 'tags_updated',
        payload: { tags },
        actor: actorId,
      },
    });

    return updated;
  }

  async bulkUpdateStatus(orderIds: string[], status: OrderStatus, actorId: string) {
    await this.prisma.order.updateMany({
      where: { id: { in: orderIds } },
      data: { orderStatus: status },
    });

    await this.prisma.orderEvent.createMany({
      data: orderIds.map((orderId) => ({
        orderId,
        eventType: 'status_changed',
        payload: { to: status },
        actor: actorId,
      })),
    });

    return { updated: orderIds.length };
  }

  async refund(orderId: string, amount: number, reason: string, actorId: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new Error('Order not found');

    const totalRefunded = Number(order.totalRefunded) + amount;
    const financialStatus: FinancialStatus =
      totalRefunded >= Number(order.total) ? 'REFUNDED' : 'PARTIALLY_REFUNDED';

    const [updatedOrder, refund] = await this.prisma.$transaction([
      this.prisma.order.update({
        where: { id: orderId },
        data: { totalRefunded, financialStatus },
      }),
      this.prisma.refund.create({
        data: { orderId, amount, reason },
      }),
    ]);

    await this.prisma.orderEvent.create({
      data: {
        orderId,
        eventType: 'refund_issued',
        payload: { amount, reason },
        actor: actorId,
      },
    });

    return { order: updatedOrder, refund };
  }
  async detectFromMessage(conversationText: string) {
    // Extract phone numbers
    const phoneMatch = conversationText.match(/(\+?216\s?[\d\s]{8,}|\b[2459]\d{7}\b)/);
    const customerPhone = phoneMatch ? phoneMatch[0].replace(/\s/g, '') : null;
  
    // Extract name - look for patterns like "Name Surname" or after keywords
    const namePatterns = [
      /(?:je suis|mon nom est|name:|nom:?)\s*([A-Za-zÀ-ÿ]+\s+[A-Za-zÀ-ÿ]+)/i,
      /([A-Z][a-zÀ-ÿ]+\s+[A-Z][a-zÀ-ÿ]+)/,
    ];
    let customerName: string | null = null;
    for (const p of namePatterns) {
      const m = conversationText.match(p);
      if (m) { customerName = m[1].trim(); break; }
    }
  
    // Extract city
    const cities = ['Tunis', 'Sfax', 'Sousse', 'Bizerte', 'Nabeul', 'Monastir', 'Mahdia', 'Gafsa', 'Kairouan', 'Gabes', 'Ariana', 'Ben Arous', 'Manouba', 'Zaghouan', 'La Marsa', 'Carthage', 'Hammamet'];
    const city = cities.find(c => conversationText.toLowerCase().includes(c.toLowerCase())) ?? null;
  
    // Extract products - "N product" patterns
    const products: any[] = [];
    const productRegex = /(\d+)\s+([a-zA-ZÀ-ÿ][a-zA-ZÀ-ÿ\s]{2,25})/g;
    let match;
    while ((match = productRegex.exec(conversationText)) !== null) {
      const qty = parseInt(match[1]);
      const title = match[2].trim();
      if (qty > 0 && qty < 50 && !['sur', 'de', 'le', 'la', 'les', 'un', 'une'].includes(title.toLowerCase())) {
        products.push({ title, quantity: qty, price: 0 });
      }
    }
  
    // Extract price
    const priceMatch = conversationText.match(/(\d+)\s*(?:TND|DT|dinars?)/i);
    if (priceMatch && products.length > 0) {
      products[0].price = parseInt(priceMatch[1]);
    }
  
    const confidence =
      (customerName ? 0.35 : 0) +
      (customerPhone ? 0.35 : 0) +
      (products.length > 0 ? 0.3 : 0);
  
    return {
      customerName,
      customerPhone,
      city,
      address: null,
      products: products.slice(0, 5),
      confidence,
    };
  }async getAgentStats(query: { from?: string; to?: string; storeIds?: string[] }) {
    const where: any = {
      assignedAgentId: { not: null },
    };
    if (query.storeIds?.length) where.storeId = { in: query.storeIds };
    if (query.from || query.to) {
      where.sourceCreatedAt = {};
      if (query.from) where.sourceCreatedAt.gte = new Date(query.from);
      if (query.to) where.sourceCreatedAt.lte = new Date(query.to);
    }
  
    const orders = await this.prisma.order.findMany({
      where,
      select: {
        assignedAgentId: true,
        assignedAgentName: true,
        orderStatus: true,
        total: true,
        callAttempts: true,
      },
    });
  
    const byAgent: Record<string, any> = {};
  
    for (const o of orders) {
      const id = o.assignedAgentId!;
      if (!byAgent[id]) {
        byAgent[id] = {
          agentId: id,
          agentName: o.assignedAgentName ?? 'Inconnu',
          total: 0,
          confirmed: 0,
          refused: 0,
          pending: 0,
          revenue: 0,
          totalAttempts: 0,
        };
      }
      const a = byAgent[id];
      a.total++;
  
      const attempts = (o.callAttempts as any[]) ?? [];
      a.totalAttempts += attempts.length;
  
      const isConfirmed = attempts.some((x) => x.result === 'ANSWERED_CONFIRMED');
      const isRefused =
        attempts.some((x) => x.result === 'ANSWERED_REFUSED') || o.orderStatus === 'ANNULE';
  
      if (isConfirmed) {
        a.confirmed++;
        a.revenue += Number(o.total);
      } else if (isRefused) {
        a.refused++;
      } else {
        a.pending++;
      }
    }
  
    return Object.values(byAgent)
      .map((a: any) => ({
        ...a,
        confirmationRate: a.total > 0 ? Math.round((a.confirmed / a.total) * 100) : 0,
        refusalRate: a.total > 0 ? Math.round((a.refused / a.total) * 100) : 0,
        avgAttempts: a.total > 0 ? +(a.totalAttempts / a.total).toFixed(1) : 0,
      }))
      .sort((x: any, y: any) => y.total - x.total);
  }
  async getCustomers(query: { storeIds?: string[]; search?: string }) {
    const where: any = { customerPhone: { not: null } };
    if (query.storeIds?.length) where.storeId = { in: query.storeIds };

    const orders = await this.prisma.order.findMany({
      where,
      include: {
        lineItems: { select: { title: true, quantity: true, price: true, sku: true } },
        store: { select: { id: true, name: true } },
      },
      orderBy: { sourceCreatedAt: 'desc' },
    });

    const byPhone: Record<string, any> = {};

    for (const o of orders) {
      const phone = (o.customerPhone ?? '').replace(/\s|\+216/g, '');
      if (!phone || phone.length < 6) continue;

      if (!byPhone[phone]) {
        byPhone[phone] = {
          phone,
          displayPhone: o.customerPhone,
          phone2: o.customerPhone2 ?? null,
          name: o.customerName ?? 'Client inconnu',
          email: o.customerEmail ?? null,
          city: (o.shippingAddress as any)?.city ?? null,
          address: (o.shippingAddress as any)?.address1 ?? null,
          stores: new Set<string>(),
          storeNames: new Set<string>(),
          sources: new Set<string>(),
          tags: new Set<string>(),
          orders: [],
          products: {} as Record<string, { title: string; qty: number; revenue: number }>,
        };
      }

      const c = byPhone[phone];
      c.stores.add(o.store.id);
      c.storeNames.add(o.store.name);
      (o.tags ?? []).forEach((t: string) => c.tags.add(t));

      const tagLower = (o.tags ?? []).map((t: string) => t.toLowerCase());
      if (o.externalOrderId?.startsWith('manual_')) c.sources.add('Manuel');
      else if (tagLower.some((t) => t.includes('whatsapp'))) c.sources.add('WhatsApp');
      else if (tagLower.some((t) => t.includes('messenger'))) c.sources.add('Messenger');
      else if (tagLower.some((t) => t.includes('instagram'))) c.sources.add('Instagram');
      else c.sources.add(o.store.name);

      const attempts = (o.callAttempts as any[]) ?? [];
      const isConfirmed =
        attempts.some((a) => a.result === 'ANSWERED_CONFIRMED') ||
        ['A_PREPARER', 'CONFIRME', 'EN_PREPARATION', 'EMBALLE', 'AU_DEPOT_LIVREUR',
         'EN_COURS_DE_LIVRAISON', 'LIVRE', 'PAYE'].includes(o.orderStatus);
      const isRefused =
        attempts.some((a) => a.result === 'ANSWERED_REFUSED') || o.orderStatus === 'ANNULE';
      const isDelivered = o.orderStatus === 'LIVRE' || o.orderStatus === 'PAYE';
      const isReturned = ['RETOUR', 'RETOUR_DEPOT', 'RETOUR_RECU'].includes(o.orderStatus);
      const isFinished = isDelivered || isReturned;

      c.orders.push({
        id: o.id,
        orderNumber: o.orderNumber,
        date: o.sourceCreatedAt,
        status: o.orderStatus,
        total: Number(o.total),
        storeName: o.store.name,
        itemCount: o.lineItems.reduce((s, li) => s + li.quantity, 0),
        isConfirmed,
        isRefused,
        isDelivered,
        isReturned,
        isFinished,
        attempts: attempts.length,
        agent: o.assignedAgentName ?? null,
      });

      for (const li of o.lineItems) {
        const key = li.title;
        if (!c.products[key]) c.products[key] = { title: li.title, qty: 0, revenue: 0 };
        c.products[key].qty += li.quantity;
        c.products[key].revenue += Number(li.price) * li.quantity;
      }
    }

    return Object.values(byPhone)
      .map((c: any) => {
        const total = c.orders.length;
        const confirmed = c.orders.filter((o: any) => o.isConfirmed).length;
        const refused = c.orders.filter((o: any) => o.isRefused).length;
        const delivered = c.orders.filter((o: any) => o.isDelivered).length;
        const returned = c.orders.filter((o: any) => o.isReturned).length;
        const finished = c.orders.filter((o: any) => o.isFinished).length;

        const paidOrders = c.orders.filter((o: any) => o.isDelivered);
        const lifetimeValue = paidOrders.reduce((s: number, o: any) => s + o.total, 0);
        const totalOrdered = c.orders.reduce((s: number, o: any) => s + o.total, 0);

        const dates = c.orders.map((o: any) => new Date(o.date).getTime());
        const firstOrder = new Date(Math.min(...dates));
        const lastOrder = new Date(Math.max(...dates));
        const daysSinceLast = Math.floor((Date.now() - lastOrder.getTime()) / 86400000);

        const topProducts = Object.values(c.products)
          .sort((a: any, b: any) => b.qty - a.qty)
          .slice(0, 5);

        return {
          phone: c.phone,
          displayPhone: c.displayPhone,
          phone2: c.phone2,
          name: c.name,
          email: c.email,
          city: c.city,
          address: c.address,
          storeIds: Array.from(c.stores),
          storeNames: Array.from(c.storeNames),
          sources: Array.from(c.sources),
          tags: Array.from(c.tags),
          totalOrders: total,
          confirmed,
          refused,
          delivered,
          returned,
          confirmationRate: total > 0 ? Math.round((confirmed / total) * 100) : 0,
          deliveryRate: finished > 0 ? Math.round((delivered / finished) * 100) : 0,
          returnRate: finished > 0 ? Math.round((returned / finished) * 100) : 0,
          lifetimeValue,
          totalOrdered,
          avgBasket: delivered > 0 ? Math.round(lifetimeValue / delivered) : 0,
          firstOrder,
          lastOrder,
          daysSinceLast,
          topProducts,
          orders: c.orders.slice(0, 50),
        };
      })
      .filter((c: any) => {
        if (!query.search) return true;
        const q = query.search.toLowerCase();
        return (
          c.name.toLowerCase().includes(q) ||
          (c.displayPhone ?? '').includes(q) ||
          (c.city ?? '').toLowerCase().includes(q)
        );
      })
      .sort((a: any, b: any) => b.lifetimeValue - a.lifetimeValue);
  }
  async getDashboard(query: { from?: string; to?: string; storeIds?: string[] }) {
    const where: any = {};
    if (query.storeIds?.length) where.storeId = { in: query.storeIds };
    if (query.from || query.to) {
      where.sourceCreatedAt = {};
      if (query.from) where.sourceCreatedAt.gte = new Date(query.from);
      if (query.to) where.sourceCreatedAt.lte = new Date(query.to);
    }
  
    const orders = await this.prisma.order.findMany({
      where,
      include: {
        lineItems: { select: { title: true, quantity: true, price: true } },
        store: { select: { id: true, name: true } },
      },
      orderBy: { sourceCreatedAt: 'asc' },
    });
  
    const active = orders.filter((o) => o.orderStatus !== 'ARCHIVE');
  
    // --- KPIs ---
    const total = active.length;
    const delivered = active.filter((o) => ['LIVRE', 'PAYE'].includes(o.orderStatus)).length;
    const paid = active.filter((o) => o.orderStatus === 'PAYE').length;
    const returned = active.filter((o) =>
      ['RETOUR', 'RETOUR_DEPOT', 'RETOUR_RECU'].includes(o.orderStatus),
    ).length;
    const cancelled = active.filter((o) => o.orderStatus === 'ANNULE').length;
    const inProgress = active.filter((o) =>
      ['A_PREPARER', 'EN_PREPARATION', 'EMBALLE', 'AU_DEPOT_LIVREUR', 'EN_COURS_DE_LIVRAISON'].includes(
        o.orderStatus,
      ),
    ).length;
    const pending = active.filter((o) =>
      ['NOUVEAU', 'CONFIRMATION_EN_COURS'].includes(o.orderStatus),
    ).length;
  
    const confirmed = active.filter((o) => {
      const attempts = (o.callAttempts as any[]) ?? [];
      return (
        attempts.some((a) => a.result === 'ANSWERED_CONFIRMED') ||
        ['A_PREPARER', 'CONFIRME', 'ECHANGE', 'EN_PREPARATION', 'EMBALLE',
         'AU_DEPOT_LIVREUR', 'EN_COURS_DE_LIVRAISON', 'LIVRE', 'PAYE'].includes(o.orderStatus)
      );
    }).length;
  
    const revenue = active
      .filter((o) => o.orderStatus === 'PAYE')
      .reduce((s, o) => s + Number(o.total), 0);
  
    const pendingRevenue = active
      .filter((o) => o.orderStatus === 'LIVRE')
      .reduce((s, o) => s + Number(o.total), 0);
  
    const potentialRevenue = active
      .filter((o) =>
        ['A_PREPARER', 'EN_PREPARATION', 'EMBALLE', 'AU_DEPOT_LIVREUR', 'EN_COURS_DE_LIVRAISON'].includes(
          o.orderStatus,
        ),
      )
      .reduce((s, o) => s + Number(o.total), 0);
  
    const finished = delivered + returned;
  
    // --- Daily timeline (last 30 buckets) ---
    const byDay: Record<string, { date: string; orders: number; delivered: number; revenue: number }> = {};
    for (const o of active) {
      const d = new Date(o.sourceCreatedAt).toISOString().slice(0, 10);
      if (!byDay[d]) byDay[d] = { date: d, orders: 0, delivered: 0, revenue: 0 };
      byDay[d].orders++;
      if (['LIVRE', 'PAYE'].includes(o.orderStatus)) byDay[d].delivered++;
      if (o.orderStatus === 'PAYE') byDay[d].revenue += Number(o.total);
    }
    const timeline = Object.values(byDay).sort((a, b) => a.date.localeCompare(b.date)).slice(-30);
  
    // --- Status breakdown ---
    const statusCounts: Record<string, number> = {};
    active.forEach((o) => {
      statusCounts[o.orderStatus] = (statusCounts[o.orderStatus] ?? 0) + 1;
    });
  
    // --- Top products ---
    const productMap: Record<string, { title: string; qty: number; revenue: number; orders: number }> = {};
    for (const o of active) {
      for (const li of o.lineItems) {
        if (!productMap[li.title]) {
          productMap[li.title] = { title: li.title, qty: 0, revenue: 0, orders: 0 };
        }
        productMap[li.title].qty += li.quantity;
        productMap[li.title].revenue += Number(li.price) * li.quantity;
        productMap[li.title].orders++;
      }
    }
    const topProducts = Object.values(productMap)
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 8);
  
    // --- Delivery company performance ---
    const carrierMap: Record<string, { name: string; total: number; delivered: number; returned: number; revenue: number }> = {};
    for (const o of active) {
      const name = o.deliveryCompany ?? 'Non assigne';
      if (!carrierMap[name]) {
        carrierMap[name] = { name, total: 0, delivered: 0, returned: 0, revenue: 0 };
      }
      carrierMap[name].total++;
      if (['LIVRE', 'PAYE'].includes(o.orderStatus)) carrierMap[name].delivered++;
      if (['RETOUR', 'RETOUR_DEPOT', 'RETOUR_RECU'].includes(o.orderStatus)) carrierMap[name].returned++;
      if (o.orderStatus === 'PAYE') carrierMap[name].revenue += Number(o.total);
    }
    const carriers = Object.values(carrierMap)
      .map((c) => {
        const fin = c.delivered + c.returned;
        return {
          ...c,
          deliveryRate: fin > 0 ? Math.round((c.delivered / fin) * 100) : 0,
          returnRate: fin > 0 ? Math.round((c.returned / fin) * 100) : 0,
        };
      })
      .sort((a, b) => b.total - a.total);
  
    // --- Store breakdown ---
    const storeMap: Record<string, { name: string; total: number; revenue: number }> = {};
    for (const o of active) {
      const key = o.store.name;
      if (!storeMap[key]) storeMap[key] = { name: key, total: 0, revenue: 0 };
      storeMap[key].total++;
      if (o.orderStatus === 'PAYE') storeMap[key].revenue += Number(o.total);
    }
    const storeStats = Object.values(storeMap).sort((a, b) => b.total - a.total);
  
    // --- Alerts ---
    const lowStock = await this.prisma.product.findMany({
      where: query.storeIds?.length ? { storeId: { in: query.storeIds } } : {},
      select: { id: true, name: true, quantityAvailable: true, lowStockThreshold: true },
    });
    const lowStockCount = lowStock.filter(
      (p) => p.quantityAvailable <= p.lowStockThreshold,
    ).length;
  
    const now = new Date();
    const scheduledSoon = active.filter((o) => {
      if (!o.scheduledDeliveryDate) return false;
      const diff = Math.ceil(
        (new Date(o.scheduledDeliveryDate).getTime() - now.getTime()) / 86400000,
      );
      return diff <= 1 && diff >= 0;
    }).length;
  
    const openReclamations = active.filter((o) => {
      if (!(o.tags ?? []).includes('Réclamation')) return false;
      try {
        const rec = JSON.parse(o.internalNote ?? '{}').reclamation;
        return rec && rec.status !== 'RESOLU';
      } catch {
        return true;
      }
    }).length;
  
    const toVerify = active.filter((o) => o.orderStatus === 'A_VERIFIER').length;
  
    return {
      kpis: {
        total,
        pending,
        confirmed,
        inProgress,
        delivered,
        paid,
        returned,
        cancelled,
        confirmationRate: total > 0 ? Math.round((confirmed / total) * 100) : 0,
        deliveryRate: finished > 0 ? Math.round((delivered / finished) * 100) : 0,
        returnRate: finished > 0 ? Math.round((returned / finished) * 100) : 0,
        revenue,
        pendingRevenue,
        potentialRevenue,
        avgBasket: paid > 0 ? Math.round(revenue / paid) : 0,
      },
      timeline,
      statusCounts,
      topProducts,
      carriers,
      storeStats,
      alerts: {
        lowStock: lowStockCount,
        scheduledSoon,
        openReclamations,
        toVerify,
      },
    };
  }
}