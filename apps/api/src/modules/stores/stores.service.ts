import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class StoresService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    const stores = await this.prisma.store.findMany({
      include: {
        _count: { select: { orders: true } },
       
      },
      orderBy: { createdAt: 'desc' },
    });

    return stores.map((s) => ({
      id: s.id,
      name: s.name,
      sourceType: s.sourceType,
      isActive: s.isActive,
      orderCount: s._count.orders,
      createdAt: s.createdAt,
    }));
  }

  async create(data: {
    name: string;
    sourceType: 'SHOPIFY' | 'CUSTOM' | 'MARKETPLACE';
    domain?: string;
    currency?: string;
  }) {
    return this.prisma.store.create({
      data: {
        name: data.name,
        sourceType: data.sourceType,
      },
    });
  }

  async toggleActive(id: string) {
    const store = await this.prisma.store.findUnique({ where: { id } });
    if (!store) throw new Error('Store not found');
    return this.prisma.store.update({
      where: { id },
      data: { isActive: !store.isActive },
    });
  }

  async remove(id: string, force = false) {
    if (!force) {
      const count = await this.prisma.order.count({ where: { storeId: id } });
      if (count > 0) {
        throw new Error(
          `Ce magasin contient ${count} commandes et ne peut pas etre supprime.`,
        );
      }
    }

    await this.prisma.orderLineItem.deleteMany({
      where: { order: { storeId: id } },
    });
    await this.prisma.orderEvent.deleteMany({
      where: { order: { storeId: id } },
    });
    await this.prisma.fulfillment.deleteMany({
      where: { order: { storeId: id } },
    });
    await this.prisma.refund.deleteMany({
      where: { order: { storeId: id } },
    });
    await this.prisma.order.deleteMany({ where: { storeId: id } });

    await this.prisma.inventoryLog.deleteMany({
      where: { product: { storeId: id } },
    });
    await this.prisma.stockAlert.deleteMany({
      where: { product: { storeId: id } },
    });
    await this.prisma.quantityOffer.deleteMany({
      where: { product: { storeId: id } },
    });
    await this.prisma.productAlias.deleteMany({
      where: { product: { storeId: id } },
    });
    await this.prisma.upsellItem.deleteMany({
      where: { upsell: { storeId: id } },
    });
    await this.prisma.upsell.deleteMany({ where: { storeId: id } });
    await this.prisma.bundleComponent.deleteMany({
      where: { bundle: { storeId: id } },
    });
    await this.prisma.bundle.deleteMany({ where: { storeId: id } });
    await this.prisma.product.deleteMany({ where: { storeId: id } });

    await this.prisma.deliveryIntegrationStore.deleteMany({
      where: { storeId: id },
    });
    await this.prisma.shippingRule.deleteMany({ where: { storeId: id } });
    await this.prisma.userStoreAccess.deleteMany({ where: { storeId: id } });

    return this.prisma.store.delete({ where: { id } });
  }

  async getShopifyProducts(id: string) {
    const store = await this.prisma.store.findUnique({ where: { id } });
    if (!store || !store.credentials) throw new Error('Store credentials not found');

    const creds = store.credentials as Record<string, string>;
    const { shopDomain, accessToken } = creds;

    const res = await fetch(
      `https://${shopDomain}/admin/api/2025-10/products.json?limit=250&status=active`,
      {
        headers: {
          'X-Shopify-Access-Token': accessToken,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`Failed to fetch Shopify products: ${res.status} ${errorText}`);
    }

    const data = await res.json() as { products: any[] };
    return data.products.map((p: any) => ({
      id: p.id,
      title: p.title,
      status: p.status,
      image: p.image?.src ?? null,
      variants: p.variants.map((v: any) => ({
        id: v.id,
        title: v.title,
        sku: v.sku,
        price: v.price,
      })),
    }));
  }

  async syncProducts(
    storeId: string,
    products: { externalId: string; name: string; sku: string; initialStock: number; threshold: number }[],
    actorId?: string,
  ) {
    const results: any[] = [];
    for (const p of products) {
      const existing = await this.prisma.product.findUnique({
        where: { storeId_sku: { storeId, sku: p.sku } },
      });

      if (existing) {
        const updated: any = await this.prisma.product.update({
          where: { id: existing.id },
          data: {
            name: p.name,
            quantityAvailable: p.initialStock,
            lowStockThreshold: p.threshold,
          },
        });

        await this.prisma.inventoryLog.create({
          data: {
            productId: existing.id,
            type: 'set',
            quantityChange: p.initialStock - existing.quantityAvailable,
            quantityBefore: existing.quantityAvailable,
            quantityAfter: p.initialStock,
            note: 'Manual stock set',
            actor: actorId ?? 'system',
          },
        });

        results.push(updated);
      } else {
        const created: any = await this.prisma.product.create({
          data: {
            storeId,
            sku: p.sku,
            name: p.name,
            quantityAvailable: p.initialStock,
            lowStockThreshold: p.threshold,
          },
        });

        await this.prisma.inventoryLog.create({
          data: {
            productId: created.id,
            type: 'set',
            quantityChange: p.initialStock,
            quantityBefore: 0,
            quantityAfter: p.initialStock,
            note: 'Product created',
            actor: actorId ?? 'system',
          },
        });

        results.push(created);
      }
    }
    return results;
  }

  async getProducts(storeId: string) {
    return this.prisma.product.findMany({
      where: { storeId },
      orderBy: { name: 'asc' },
    });
  }

  async updateProduct(
    id: string,
    data: { quantityAvailable?: number; lowStockThreshold?: number; name?: string },
    actorId?: string,
    note?: string,
  ) {
    const existing = await this.prisma.product.findUnique({ where: { id } });
    if (!existing) throw new Error('Product not found');

    const updated = await this.prisma.product.update({
      where: { id },
      data,
    });

    if (data.quantityAvailable !== undefined && data.quantityAvailable !== existing.quantityAvailable) {
      const change = data.quantityAvailable - existing.quantityAvailable;
      await this.prisma.inventoryLog.create({
        data: {
          productId: id,
          type: change > 0 ? 'manual_add' : 'manual_remove',
          quantityChange: change,
          quantityBefore: existing.quantityAvailable,
          quantityAfter: data.quantityAvailable,
          note: note ?? (change > 0 ? 'Manual stock addition' : 'Manual stock removal'),
          actor: actorId ?? 'system',
        },
      });

      if (data.quantityAvailable <= existing.lowStockThreshold) {
        await this.prisma.stockAlert.create({
          data: {
            productId: id,
            thresholdAtTrigger: existing.lowStockThreshold,
          },
        });
      }
    }

    return updated;
  }

  async removeProduct(id: string) {
    return this.prisma.product.delete({ where: { id } });
  }

  async getInventoryLogs(productId: string) {
    const logs = await this.prisma.inventoryLog.findMany({
      where: { productId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    const userIds = logs
      .map((l) => l.actor)
      .filter((a) => a && !a.startsWith('system')) as string[];

    const users = userIds.length > 0
      ? await this.prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, name: true },
        })
      : [];

    const userMap = Object.fromEntries(users.map((u) => [u.id, u.name]));

    return logs.map((l) => ({
      ...l,
      actorName: l.actor === 'system:webhook' ? 'Shopify'
        : l.actor === 'system' ? 'System'
        : l.actor ? (userMap[l.actor] ?? l.actor)
        : '—',
    }));
  }
}