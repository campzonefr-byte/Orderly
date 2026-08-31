import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ProductsService {
  constructor(private prisma: PrismaService) {}

  async listWithStats(storeIds?: string[], activeOnly = true) {
    const where: any = {};
    if (activeOnly) where.isActive = true;
    if (storeIds?.length) where.storeId = { in: storeIds };

    const products = await this.prisma.product.findMany({
      where,
      include: { store: { select: { id: true, name: true } } },
      orderBy: { name: 'asc' },
    });

    // Sales over the last 90 days
    const since = new Date(Date.now() - 90 * 86400000);
    const soldItems = await this.prisma.orderLineItem.findMany({
      where: {
        order: {
          ...(storeIds?.length && { storeId: { in: storeIds } }),
          sourceCreatedAt: { gte: since },
          orderStatus: { notIn: ['ANNULE', 'ARCHIVE'] },
        },
      },
      select: {
        sku: true,
        quantity: true,
        price: true,
        order: { select: { sourceCreatedAt: true, orderStatus: true } },
      },
    });

    const bySku: Record<string, any> = {};
    const now = Date.now();

    for (const li of soldItems) {
      if (!li.sku) continue;
      if (!bySku[li.sku]) {
        bySku[li.sku] = { d7: 0, d30: 0, d90: 0, revenue: 0, returned: 0 };
      }
      const age = (now - new Date(li.order.sourceCreatedAt).getTime()) / 86400000;
      const s = bySku[li.sku];

      s.d90 += li.quantity;
      if (age <= 30) s.d30 += li.quantity;
      if (age <= 7) s.d7 += li.quantity;

      if (['LIVRE', 'PAYE'].includes(li.order.orderStatus)) {
        s.revenue += Number(li.price) * li.quantity;
      }
      if (['RETOUR', 'RETOUR_DEPOT', 'RETOUR_RECU'].includes(li.order.orderStatus)) {
        s.returned += li.quantity;
      }
    }

    return products.map((p) => {
      const s = bySku[p.sku] ?? { d7: 0, d30: 0, d90: 0, revenue: 0, returned: 0 };

      // Daily velocity, weighted toward recent sales
      const v7 = s.d7 / 7;
      const v30 = s.d30 / 30;
      const v90 = s.d90 / 90;
      const velocity = v7 > 0 ? v7 * 0.6 + v30 * 0.3 + v90 * 0.1 : v30 > 0 ? v30 : v90;

      const daysLeft = velocity > 0 ? Math.floor(p.quantityAvailable / velocity) : null;
      const outOfStockDate =
        daysLeft !== null && daysLeft < 365
          ? new Date(Date.now() + daysLeft * 86400000).toISOString()
          : null;

      // Suggest 30 days of stock
      const suggestedReorder =
        velocity > 0 ? Math.max(0, Math.ceil(velocity * 30 - p.quantityAvailable)) : 0;

      const status =
        p.quantityAvailable === 0
          ? 'OUT'
          : p.quantityAvailable <= p.lowStockThreshold
          ? 'LOW'
          : daysLeft !== null && daysLeft <= 7
          ? 'SOON'
          : 'OK';

      return {
        ...p,
        storeName: p.store.name,
        stats: {
          sold7: s.d7,
          sold30: s.d30,
          sold90: s.d90,
          returned: s.returned,
          revenue: Math.round(s.revenue),
          velocity: +velocity.toFixed(2),
          daysLeft,
          outOfStockDate,
          suggestedReorder,
          returnRate: s.d90 > 0 ? Math.round((s.returned / s.d90) * 100) : 0,
        },
        status,
      };
    });
  }

  async getOne(id: string) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: { store: { select: { name: true } } },
    });
    if (!product) return null;

    const logs = await this.prisma.inventoryLog.findMany({
      where: { productId: id },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    // Resolve actor names
    const actorIds = [...new Set(logs.map((l) => l.actor).filter(Boolean))] as string[];
    const users = await this.prisma.user.findMany({
      where: { id: { in: actorIds } },
      select: { id: true, name: true },
    });
    const userMap = Object.fromEntries(users.map((u) => [u.id, u.name]));

    return {
      ...product,
      storeName: product.store.name,
      logs: logs.map((l) => ({
        ...l,
        actorName: l.actor ? userMap[l.actor] ?? l.actor : 'Systeme',
      })),
    };
  }

  async adjustStock(
    id: string,
    data: {
      type: 'ADD' | 'REMOVE' | 'TO_DEFECTIVE' | 'FROM_DEFECTIVE' | 'SET';
      quantity: number;
      note?: string;
    },
    actorId: string,
  ) {
    const product = await this.prisma.product.findUnique({ where: { id } });
    if (!product) throw new Error('Produit introuvable');

    const qty = Math.abs(data.quantity);
    let available = product.quantityAvailable;
    let defective = product.defectiveQty;

    switch (data.type) {
      case 'ADD':
        available += qty;
        break;
      case 'REMOVE':
        available = Math.max(0, available - qty);
        break;
      case 'SET':
        available = qty;
        break;
      case 'TO_DEFECTIVE':
        if (qty > available) throw new Error('Quantite superieure au stock disponible');
        available -= qty;
        defective += qty;
        break;
      case 'FROM_DEFECTIVE':
        if (qty > defective) throw new Error('Quantite superieure au stock defectueux');
        defective -= qty;
        available += qty;
        break;
    }

    const updated = await this.prisma.product.update({
      where: { id },
      data: { quantityAvailable: available, defectiveQty: defective },
    });

    await this.prisma.inventoryLog.create({
      data: {
        productId: id,
        type: data.type,
        quantityChange: available - product.quantityAvailable,
        quantityBefore: product.quantityAvailable,
        quantityAfter: available,
        note: data.note ?? null,
        actor: actorId,
      },
    });

    // Auto-create stock alert
    if (available <= updated.lowStockThreshold && product.quantityAvailable > updated.lowStockThreshold) {
      await this.prisma.stockAlert.create({
        data: { productId: id, thresholdAtTrigger: updated.lowStockThreshold },
      });
    }

    return updated;
  }

  async updateProduct(
    id: string,
    data: {
      name?: string;
      sku?: string;
      lowStockThreshold?: number;
      reorderQty?: number;
      costPrice?: number;
      sellPrice?: number;
      isActive?: boolean;
    },
    actorId: string,
  ) {
    const updated = await this.prisma.product.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.sku !== undefined && { sku: data.sku }),
        ...(data.lowStockThreshold !== undefined && { lowStockThreshold: data.lowStockThreshold }),
        ...(data.reorderQty !== undefined && { reorderQty: data.reorderQty }),
        ...(data.costPrice !== undefined && { costPrice: data.costPrice }),
        ...(data.sellPrice !== undefined && { sellPrice: data.sellPrice }),
        ...(data.isActive !== undefined && { isActive: data.isActive }),
      },
    });

    await this.prisma.inventoryLog.create({
      data: {
        productId: id,
        type: 'SETTINGS_UPDATED',
        quantityChange: 0,
        quantityBefore: updated.quantityAvailable,
        quantityAfter: updated.quantityAvailable,
        note: `Champs modifies : ${Object.keys(data).join(', ')}`,
        actor: actorId,
      },
    });

    return updated;
  }

  async create(
    data: {
      storeId: string;
      sku: string;
      name: string;
      quantityAvailable?: number;
      lowStockThreshold?: number;
      costPrice?: number;
      sellPrice?: number;
    },
    actorId: string,
  ) {
    const product = await this.prisma.product.create({
      data: {
        storeId: data.storeId,
        sku: data.sku,
        name: data.name,
        quantityAvailable: data.quantityAvailable ?? 0,
        lowStockThreshold: data.lowStockThreshold ?? 5,
        costPrice: data.costPrice ?? null,
        sellPrice: data.sellPrice ?? null,
      },
    });

    await this.prisma.inventoryLog.create({
      data: {
        productId: product.id,
        type: 'CREATED',
        quantityChange: product.quantityAvailable,
        quantityBefore: 0,
        quantityAfter: product.quantityAvailable,
        note: 'Produit cree manuellement',
        actor: actorId,
      },
    });

    return product;
  }

  async remove(id: string) {
    return this.prisma.product.delete({ where: { id } });
  }

  async summary(storeIds?: string[]) {
    const products = await this.listWithStats(storeIds, false);
    return {
      total: products.length,
      ok: products.filter((p) => p.status === 'OK').length,
      soon: products.filter((p) => p.status === 'SOON').length,
      low: products.filter((p) => p.status === 'LOW').length,
      out: products.filter((p) => p.status === 'OUT').length,
      defective: products.reduce((s, p) => s + p.defectiveQty, 0),
      totalUnits: products.reduce((s, p) => s + p.quantityAvailable, 0),
      stockValue: products.reduce(
        (s, p) => s + p.quantityAvailable * Number(p.costPrice ?? 0),
        0,
      ),
    };
  }
  async listAll(storeIds?: string[]) {
    return this.listWithStats(storeIds, false);
  }
  async listOffers(productId: string) {
    return this.prisma.quantityOffer.findMany({
      where: { productId },
      orderBy: { quantity: 'asc' },
    });
  }

  async createOffer(data: {
    productId: string;
    quantity: number;
    priceType: 'FIXED' | 'PERCENT';
    price?: number;
    percent?: number;
    label?: string;
  }) {
    return this.prisma.quantityOffer.upsert({
      where: {
        productId_quantity: {
          productId: data.productId,
          quantity: data.quantity,
        },
      },
      create: {
        productId: data.productId,
        quantity: data.quantity,
        priceType: data.priceType,
        price: data.price ?? null,
        percent: data.percent ?? null,
        label: data.label ?? null,
      },
      update: {
        priceType: data.priceType,
        price: data.price ?? null,
        percent: data.percent ?? null,
        label: data.label ?? null,
      },
    });
  }

  async removeOffer(id: string) {
    return this.prisma.quantityOffer.delete({ where: { id } });
  }

  // Compute the effective price for a given SKU and quantity
  async computePrice(
    storeId: string,
    sku: string,
    quantity: number,
    orderDate?: Date,
  ) {
    const product = await this.prisma.product.findUnique({
      where: { storeId_sku: { storeId, sku } },
      include: { quantityOffers: { orderBy: { quantity: 'desc' } } },
    });

    if (!product) return { unitPrice: 0, total: 0, offerApplied: null };

    const basePrice = Number(product.sellPrice ?? 0);
    const refDate = orderDate ?? new Date();

    const validOffers = product.quantityOffers.filter((o) => {
      if (!o.isActive) return false;
      if (o.startsAt && refDate < o.startsAt) return false;
      if (o.endsAt && refDate > o.endsAt) return false;
      return true;
    });

    const offer = validOffers.find((o) => o.quantity <= quantity);

    if (!offer) {
      return {
        unitPrice: basePrice,
        total: basePrice * quantity,
        offerApplied: null,
      };
    }

    const packs = Math.floor(quantity / offer.quantity);
    const remainder = quantity % offer.quantity;

    let packPrice: number;
    if (offer.priceType === 'PERCENT') {
      const discount = Number(offer.percent ?? 0) / 100;
      packPrice = basePrice * offer.quantity * (1 - discount);
    } else {
      packPrice = Number(offer.price ?? 0);
    }

    const total = packs * packPrice + remainder * basePrice;

    return {
      unitPrice: quantity > 0 ? total / quantity : basePrice,
      total,
      offerApplied: {
        quantity: offer.quantity,
        priceType: offer.priceType,
        price: offer.price ? Number(offer.price) : null,
        percent: offer.percent ? Number(offer.percent) : null,
      },
    };
  }
}