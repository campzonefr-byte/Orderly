import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class BundlesService {
  constructor(private prisma: PrismaService) {}

  async list(storeIds?: string[]) {
    const where: any = {};
    if (storeIds?.length) where.storeId = { in: storeIds };

    const bundles = await this.prisma.bundle.findMany({
      where,
      include: {
        product: true,
        store: { select: { name: true } },
        components: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
                sku: true,
                quantityAvailable: true,
                imageUrl: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Compute stats and available stock for each bundle
    const since90 = new Date(Date.now() - 90 * 86400000);

    return Promise.all(
      bundles.map(async (b) => {
        // Sales stats using the bundle product SKU
        const soldItems = await this.prisma.orderLineItem.findMany({
          where: {
            sku: b.product.sku,
            order: {
              storeId: b.storeId,
              sourceCreatedAt: { gte: since90 },
              orderStatus: { notIn: ['ANNULE', 'ARCHIVE'] },
            },
          },
          select: {
            quantity: true,
            price: true,
            order: { select: { orderStatus: true, sourceCreatedAt: true } },
          },
        });

        const now = Date.now();
        let sold7 = 0, sold30 = 0, sold90 = 0, revenue = 0, returned = 0;

        for (const li of soldItems) {
          const age = (now - new Date(li.order.sourceCreatedAt).getTime()) / 86400000;
          sold90 += li.quantity;
          if (age <= 30) sold30 += li.quantity;
          if (age <= 7) sold7 += li.quantity;
          if (['LIVRE', 'PAYE'].includes(li.order.orderStatus)) {
            revenue += Number(li.price) * li.quantity;
          }
          if (['RETOUR', 'RETOUR_DEPOT', 'RETOUR_RECU'].includes(li.order.orderStatus)) {
            returned += li.quantity;
          }
        }

        // Computed stock = min(component.stock / component.qty)
        let computedStock: number | null = null;
        for (const c of b.components) {
          const possible = Math.floor(c.product.quantityAvailable / c.quantity);
          if (computedStock === null || possible < computedStock) {
            computedStock = possible;
          }
        }

        return {
          ...b,
          storeName: b.store.name,
          stats: {
            sold7,
            sold30,
            sold90,
            revenue: Math.round(revenue),
            returned,
            returnRate: sold90 > 0 ? Math.round((returned / sold90) * 100) : 0,
          },
          computedStock: computedStock ?? 0,
        };
      }),
    );
  }

  async create(data: {
    storeId: string;
    productId: string;
    name: string;
    components: { productId: string; quantity: number }[];
  }) {
    // Validate product exists and belongs to store
    const product = await this.prisma.product.findUnique({
      where: { id: data.productId },
    });
    if (!product || product.storeId !== data.storeId) {
      throw new Error('Produit introuvable');
    }
    if (product.bundle) {
      throw new Error('Ce produit est déjà configuré comme bundle');
    }

    return this.prisma.bundle.create({
      data: {
        storeId: data.storeId,
        productId: data.productId,
        name: data.name,
        sku: product.sku,
        components: {
          create: data.components.map((c) => ({
            productId: c.productId,
            quantity: c.quantity,
          })),
        },
      },
      include: {
        components: { include: { product: true } },
        product: true,
      },
    });
  }

  async update(
    id: string,
    data: {
      name?: string;
      isActive?: boolean;
      components?: { productId: string; quantity: number }[];
    },
  ) {
    const updated = await this.prisma.bundle.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.isActive !== undefined && { isActive: data.isActive }),
        ...(data.components && {
          components: {
            deleteMany: {},
            create: data.components.map((c) => ({
              productId: c.productId,
              quantity: c.quantity,
            })),
          },
        }),
      },
      include: {
        components: { include: { product: true } },
        product: true,
      },
    });
    return updated;
  }

  async remove(id: string) {
    return this.prisma.bundle.delete({ where: { id } });
  }

  // Called when an order is confirmed — deduct component stocks
  async deductStock(storeId: string, lineItems: { sku: string; quantity: number }[]) {
    const logs: any[] = [];

    for (const li of lineItems) {
      const bundle = await this.prisma.bundle.findFirst({
        where: { storeId, product: { sku: li.sku }, isActive: true },
        include: { components: { include: { product: true } } },
      });

      if (!bundle) continue;

      for (const comp of bundle.components) {
        const toDeduct = comp.quantity * li.quantity;
        const before = comp.product.quantityAvailable;
        const after = Math.max(0, before - toDeduct);

        await this.prisma.product.update({
          where: { id: comp.productId },
          data: { quantityAvailable: after },
        });

        await this.prisma.inventoryLog.create({
          data: {
            productId: comp.productId,
            type: 'SALE',
            quantityChange: -(before - after),
            quantityBefore: before,
            quantityAfter: after,
            note: `Bundle vendu : ${bundle.name} × ${li.quantity}`,
            actor: 'system:bundle',
          },
        });

        logs.push({ product: comp.product.name, deducted: before - after });
      }
    }

    return { ok: true, logs };
  }

  async listProducts(storeId: string) {
    // Products not already used as bundles
    const bundles = await this.prisma.bundle.findMany({
      where: { storeId },
      select: { productId: true },
    });
    const bundleProductIds = new Set(bundles.map((b) => b.productId));

    const products = await this.prisma.product.findMany({
      where: { storeId, isActive: true },
      select: { id: true, name: true, sku: true, imageUrl: true, quantityAvailable: true },
      orderBy: { name: 'asc' },
    });

    return products.map((p) => ({
      ...p,
      isBundle: bundleProductIds.has(p.id),
    }));
  }
}