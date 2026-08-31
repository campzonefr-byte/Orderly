import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ShippingService {
  constructor(private prisma: PrismaService) {}

  async list(storeIds?: string[]) {
    const where: any = {};
    if (storeIds?.length) where.storeId = { in: storeIds };

    return this.prisma.shippingRule.findMany({
      where,
      include: { store: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getForStore(storeId: string) {
    return this.prisma.shippingRule.findFirst({
      where: { storeId, isActive: true },
    });
  }

  async create(data: {
    storeId: string;
    name?: string;
    basePrice: number;
    freeThreshold?: number | null;
    cityOverrides?: Record<string, number> | null;
  }) {
    return this.prisma.shippingRule.create({
      data: {
        storeId: data.storeId,
        name: data.name ?? 'Livraison standard',
        basePrice: data.basePrice,
        freeThreshold: data.freeThreshold ?? null,
        cityOverrides: data.cityOverrides ?? undefined,
      },
    });
  }

  async update(
    id: string,
    data: {
      name?: string;
      basePrice?: number;
      freeThreshold?: number | null;
      cityOverrides?: Record<string, number> | null;
      isActive?: boolean;
    },
  ) {
    return this.prisma.shippingRule.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.basePrice !== undefined && { basePrice: data.basePrice }),
        ...(data.freeThreshold !== undefined && { freeThreshold: data.freeThreshold }),
        ...(data.cityOverrides !== undefined && { cityOverrides: data.cityOverrides ?? undefined }),
        ...(data.isActive !== undefined && { isActive: data.isActive }),
      },
    });
  }

  async remove(id: string) {
    return this.prisma.shippingRule.delete({ where: { id } });
  }

  // Compute shipping cost for a given subtotal and city
  async calculate(storeId: string, subtotal: number, city?: string) {
    const rule = await this.getForStore(storeId);
    if (!rule) return { cost: 0, isFree: false, reason: 'Aucune règle définie' };

    // No items = no shipping
    if (subtotal <= 0) {
      return { cost: 0, isFree: false, reason: 'Commande vide' };
    }

    // Free above threshold
    if (rule.freeThreshold && subtotal >= Number(rule.freeThreshold)) {
      return {
        cost: 0,
        isFree: true,
        reason: `Gratuite au-dessus de ${Number(rule.freeThreshold)} TND`,
      };
    }

    // City-specific price
    const overrides = (rule.cityOverrides as Record<string, number>) ?? {};
    if (city && overrides[city] !== undefined) {
      return {
        cost: Number(overrides[city]),
        isFree: false,
        reason: `Tarif ${city}`,
      };
    }

    return {
      cost: Number(rule.basePrice),
      isFree: false,
      reason: 'Tarif standard',
    };
  }
}