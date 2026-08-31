import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class UpsellsService {
  constructor(private prisma: PrismaService) {}

  async list(storeIds?: string[]) {
    const where: any = {};
    if (storeIds?.length) where.storeId = { in: storeIds };

    return this.prisma.upsell.findMany({
      where,
      include: {
        store: { select: { name: true } },
        triggerProduct: {
          select: { id: true, name: true, sku: true, imageUrl: true, sellPrice: true },
        },
        items: {
          include: {
            product: {
              select: { id: true, name: true, sku: true, imageUrl: true, sellPrice: true },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(data: {
    storeId: string;
    name: string;
    triggerProductId: string;
    items: { productId: string; price: number }[];
  }) {
    return this.prisma.upsell.create({
      data: {
        storeId: data.storeId,
        name: data.name,
        triggerProductId: data.triggerProductId,
        items: {
          create: data.items.map((i) => ({
            productId: i.productId,
            price: i.price,
          })),
        },
      },
      include: {
        triggerProduct: true,
        items: { include: { product: true } },
      },
    });
  }

  async update(
    id: string,
    data: {
      name?: string;
      isActive?: boolean;
      items?: { productId: string; price: number }[];
    },
  ) {
    return this.prisma.upsell.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.isActive !== undefined && { isActive: data.isActive }),
        ...(data.items && {
          items: {
            deleteMany: {},
            create: data.items.map((i) => ({
              productId: i.productId,
              price: i.price,
            })),
          },
        }),
      },
      include: {
        triggerProduct: true,
        items: { include: { product: true } },
      },
    });
  }

  async remove(id: string) {
    return this.prisma.upsell.delete({ where: { id } });
  }

  // Given the SKUs in a cart, return special prices that apply
  async computeUpsells(storeId: string, skus: string[]) {
    if (skus.length === 0) return { prices: {} };

    const products = await this.prisma.product.findMany({
      where: { storeId, sku: { in: skus } },
      select: { id: true, sku: true },
    });
    const idBySku = Object.fromEntries(products.map((p) => [p.sku, p.id]));
    const productIds = products.map((p) => p.id);

    // Find active upsells whose trigger product is in the cart
    const upsells = await this.prisma.upsell.findMany({
      where: {
        storeId,
        isActive: true,
        triggerProductId: { in: productIds },
      },
      include: {
        items: {
          include: { product: { select: { sku: true } } },
        },
      },
    });

    const prices: Record<string, { price: number; upsellName: string }> = {};

    for (const u of upsells) {
      for (const item of u.items) {
        const sku = item.product.sku;
        // Only apply if that product is also in the cart
        if (skus.includes(sku)) {
          prices[sku] = {
            price: Number(item.price),
            upsellName: u.name,
          };
        }
      }
    }

    return { prices };
  }
}