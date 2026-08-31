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
    startsAt?: string | null;
    endsAt?: string | null;
  }) {
    return this.prisma.upsell.create({
      data: {
        storeId: data.storeId,
        name: data.name,
        triggerProductId: data.triggerProductId,
        startsAt: data.startsAt ? new Date(data.startsAt) : null,
        endsAt: data.endsAt ? new Date(data.endsAt) : null,
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
      startsAt?: string | null;
      endsAt?: string | null;
    },
  ) {
    return this.prisma.upsell.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.isActive !== undefined && { isActive: data.isActive }),
        ...(data.startsAt !== undefined && {
          startsAt: data.startsAt ? new Date(data.startsAt) : null,
        }),
        ...(data.endsAt !== undefined && {
          endsAt: data.endsAt ? new Date(data.endsAt) : null,
        }),
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
  async computeUpsells(storeId: string, skus: string[], orderDate?: Date) {
    if (skus.length === 0) return { prices: {} };

    const refDate = orderDate ?? new Date();

    const products = await this.prisma.product.findMany({
      where: { storeId, sku: { in: skus } },
      select: { id: true, sku: true },
    });
    const productIds = products.map((p) => p.id);

    const upsells = await this.prisma.upsell.findMany({
      where: { storeId, triggerProductId: { in: productIds } },
      include: { items: { include: { product: { select: { sku: true } } } } },
    });

    const validUpsells = upsells.filter((u) => {
      if (!u.isActive) return false;
      if (u.startsAt && refDate < u.startsAt) return false;
      if (u.endsAt && refDate > u.endsAt) return false;
      return true;
    });

    const prices: Record<string, { price: number; upsellName: string }> = {};

    for (const u of validUpsells) {
      for (const item of u.items) {
        const sku = item.product.sku;
        if (skus.includes(sku)) {
          prices[sku] = { price: Number(item.price), upsellName: u.name };
        }
      }
    }

    return { prices };
  }
}