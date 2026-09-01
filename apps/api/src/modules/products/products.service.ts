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
  async listAliases(productId: string) {
    return this.prisma.productAlias.findMany({
      where: { productId },
      orderBy: { alias: 'asc' },
    });
  }

  async addAlias(productId: string, alias: string) {
    const clean = alias.trim();
    if (!clean) throw new Error('Alias vide');

    return this.prisma.productAlias.upsert({
      where: { productId_alias: { productId, alias: clean } },
      create: { productId, alias: clean },
      update: {},
    });
  }

  async removeAlias(id: string) {
    return this.prisma.productAlias.delete({ where: { id } });
  }

  // Find a product by SKU, exact name, or alias
  async resolveProduct(storeId: string, sku: string | null, title: string) {
    // 1. Try SKU first
    if (sku) {
      const bySku = await this.prisma.product.findUnique({
        where: { storeId_sku: { storeId, sku } },
      });
      if (bySku) return bySku;
    }

    // 2. Try exact name
    const byName = await this.prisma.product.findFirst({
      where: { storeId, name: { equals: title, mode: 'insensitive' } },
    });
    if (byName) return byName;

    // 3. Try aliases
    const alias = await this.prisma.productAlias.findFirst({
      where: {
        alias: { equals: title, mode: 'insensitive' },
        product: { storeId },
      },
      include: { product: true },
    });
    if (alias) return alias.product;

    return null;
  }
  async relinkOrderLines(storeId: string) {
    const lines = await this.prisma.orderLineItem.findMany({
      where: {
        productId: null,
        order: { storeId },
      },
      select: { id: true, sku: true, title: true },
    });

    let linked = 0;

    for (const line of lines) {
      let productId: string | null = null;

      if (line.sku) {
        const bySku = await this.prisma.product.findUnique({
          where: { storeId_sku: { storeId, sku: line.sku } },
          select: { id: true },
        });
        if (bySku) productId = bySku.id;
      }

      if (!productId && line.title) {
        const byName = await this.prisma.product.findFirst({
          where: { storeId, name: { equals: line.title, mode: 'insensitive' } },
          select: { id: true },
        });
        if (byName) productId = byName.id;
      }

      if (!productId && line.title) {
        const alias = await this.prisma.productAlias.findFirst({
          where: {
            alias: { equals: line.title, mode: 'insensitive' },
            product: { storeId },
          },
          select: { productId: true },
        });
        if (alias) productId = alias.productId;
      }

      if (productId) {
        await this.prisma.orderLineItem.update({
          where: { id: line.id },
          data: { productId },
        });
        linked++;
      }
    }

    return { ok: true, checked: lines.length, linked };
  }
    // Read EasySell quantity offers from a Shopify storefront product page
    async syncEasySellOffers(storeId: string) {
      const store = await this.prisma.store.findUnique({ where: { id: storeId } });
      if (!store) return { ok: false, error: 'Magasin introuvable' };
  
      const creds = (store.credentials as any) ?? {};
      const domain = creds.shopDomain;
      if (!domain) return { ok: false, error: 'Domaine Shopify manquant' };
  
      const products = await this.prisma.product.findMany({
        where: { storeId, isActive: true },
        select: { id: true, sku: true, name: true, sellPrice: true, externalId: true },
      });
  
      if (products.length === 0) return { ok: false, error: 'Aucun produit' };
  
      // Fetch one product page to grab the global EasySell config
      let html = '';
      try {
        const res = await fetch(`https://${domain}/products.json?limit=1`);
        const data: any = await res.json();
        const handle = data?.products?.[0]?.handle;
        if (!handle) return { ok: false, error: 'Aucun produit trouve sur la boutique' };
  
        const pageRes = await fetch(`https://${domain}/products/${handle}`);
        html = await pageRes.text();
      } catch (e: any) {
        return { ok: false, error: `Impossible de lire la boutique : ${e?.message}` };
      }
  
      // Extract EASYSELL_QUANTITY_OFFERS
      const match = html.match(
        /window\.EASYSELL_QUANTITY_OFFERS\s*=\s*(\[[\s\S]*?\]);/,
      );
      if (!match) {
        return { ok: false, error: 'Configuration EasySell introuvable sur la page' };
      }
  
      let config: any[];
      try {
        config = JSON.parse(match[1]);
      } catch {
        return { ok: false, error: 'Configuration EasySell illisible' };
      }
  
      // Map Shopify product GIDs to Orderly products
      const shopifyProducts = await this.fetchShopifyProductMap(domain, creds.accessToken);
  
      let created = 0;
      let skipped = 0;
      const details: any[] = [];
  
      for (const group of config) {
        if (!group.enabled) continue;
  
        for (const gid of group.productIds ?? []) {
          const shopifyId = String(gid).split('/').pop();
          const skus = shopifyProducts[shopifyId!] ?? [];
  
          for (const sku of skus) {
            const product = products.find((p) => p.sku === sku);
            if (!product) {
              skipped++;
              continue;
            }
  
            const basePrice = Number(product.sellPrice ?? 0);
            if (basePrice === 0) {
              skipped++;
              continue;
            }
  
            for (const offer of group.offers ?? []) {
              const qty = Number(offer.quantity);
              if (!qty || qty < 2) continue;
  
              const d = offer.discount ?? {};
              if (d.type === 'no_discount') continue;
  
              let payload: any = { productId: product.id, quantity: qty };
  
              if (d.type === 'percentage') {
                payload.priceType = 'PERCENT';
                payload.percent = Number(d.value);
              } else {
                // fixed = total discount amount off the normal price
                const normal = basePrice * qty;
                payload.priceType = 'FIXED';
                payload.price = normal - Number(d.value);
              }
  
              payload.label = offer.title ?? null;
  
              await this.prisma.quantityOffer.upsert({
                where: {
                  productId_quantity: { productId: product.id, quantity: qty },
                },
                create: payload,
                update: {
                  priceType: payload.priceType,
                  price: payload.price ?? null,
                  percent: payload.percent ?? null,
                  label: payload.label,
                },
              });
  
              created++;
              details.push({
                product: product.name,
                quantity: qty,
                type: payload.priceType,
                value: payload.price ?? payload.percent,
              });
            }
          }
        }
      }
  
      return { ok: true, created, skipped, details };
    }
  
    private async fetchShopifyProductMap(domain: string, token?: string) {
      const map: Record<string, string[]> = {};
      if (!token) return map;
  
      try {
        const res = await fetch(
          `https://${domain}/admin/api/2024-10/products.json?limit=250&fields=id,variants`,
          { headers: { 'X-Shopify-Access-Token': token } },
        );
        const data: any = await res.json();
        for (const p of data?.products ?? []) {
          const skus = (p.variants ?? [])
            .map((v: any) => String(v.sku || v.id))
            .filter(Boolean);
          map[String(p.id)] = skus;
        }
      } catch {}
  
      return map;
    }
}