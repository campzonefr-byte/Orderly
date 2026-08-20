import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

const API_VERSION = '2024-10';

@Injectable()
export class ShopifyService {
  constructor(private prisma: PrismaService) {}

  private async getConfig(storeId: string) {
    const store = await this.prisma.store.findUnique({ where: { id: storeId } });
    if (!store) return null;
    const creds = store.credentials as any;
    if (!creds?.accessToken || !creds?.shopDomain) return null;

    const domain = String(creds.shopDomain)
      .replace(/^https?:\/\//, '')
      .replace(/\/$/, '');

    return { token: String(creds.accessToken), domain };
  }

  private async call(storeId: string, path: string) {
    const config = await this.getConfig(storeId);
    if (!config) {
      return { ok: false, error: 'Shopify non configure pour ce magasin', data: null };
    }

    const url = `https://${config.domain}/admin/api/${API_VERSION}${path}`;

    try {
      const res = await fetch(url, {
        headers: {
          'X-Shopify-Access-Token': config.token,
          'Content-Type': 'application/json',
        },
      });

      const raw = await res.text();

      if (raw.trim().startsWith('<')) {
        return {
          ok: false,
          error: `Reponse HTML (HTTP ${res.status}) — verifiez le domaine et le token`,
          data: null,
        };
      }

      const data = JSON.parse(raw);

      if (!res.ok) {
        const msg =
          res.status === 401
            ? 'Token invalide ou expire'
            : res.status === 403
            ? 'Permissions insuffisantes — activez read_products'
            : data?.errors ?? `HTTP ${res.status}`;
        return { ok: false, error: String(msg), data: null };
      }

      return { ok: true, data, error: null };
    } catch (e: any) {
      return { ok: false, error: e?.message ?? 'Erreur reseau', data: null };
    }
  }

  async testConnection(storeId: string) {
    const r = await this.call(storeId, '/shop.json');
    if (!r.ok) return { ok: false, error: r.error };
    return {
      ok: true,
      shop: r.data?.shop?.name ?? null,
      domain: r.data?.shop?.myshopify_domain ?? null,
    };
  }

  async getStatus(storeId: string) {
    const config = await this.getConfig(storeId);
    if (!config) return { connected: false, hasToken: false };
    return { connected: true, hasToken: true, domain: config.domain };
  }

  async browseProducts(storeId: string, search?: string) {
    const r = await this.call(storeId, '/products.json?limit=250');
    if (!r.ok) return { ok: false, error: r.error, items: [] };

    const products: any[] = r.data?.products ?? [];

    const existing = await this.prisma.product.findMany({
      where: { storeId },
      select: { sku: true },
    });
    const known = new Set(existing.map((e) => e.sku));

    const items = products
      .map((p) => {
        const variants: any[] = p.variants ?? [];
        const hasRealVariants =
          variants.length > 1 ||
          (variants.length === 1 && variants[0].title !== 'Default Title');

        const mainVariant = variants[0] ?? {};
        const mainSku = String(mainVariant.sku || mainVariant.id || p.id);

        return {
          id: String(p.id),
          name: p.title ?? 'Produit',
          sku: mainSku,
          price: Number(mainVariant.price ?? 0),
          cost: 0,
          stock: Number(mainVariant.inventory_quantity ?? 0),
          image: p.image?.src ?? p.images?.[0]?.src ?? null,
          status: p.status ?? 'active',
          alreadyImported: known.has(mainSku),
          variants: hasRealVariants
            ? variants.map((v) => {
                const sku = String(v.sku || v.id);
                return {
                  id: String(v.id),
                  sku,
                  label: v.title ?? 'Variante',
                  price: Number(v.price ?? 0),
                  cost: 0,
                  stock: Number(v.inventory_quantity ?? 0),
                  alertOn: 5,
                  alreadyImported: known.has(sku),
                };
              })
            : [],
        };
      })
      .filter((p) => {
        if (!search) return true;
        const q = search.toLowerCase();
        return (
          p.name.toLowerCase().includes(q) ||
          p.sku.toLowerCase().includes(q) ||
          p.variants.some((v: any) => v.sku.toLowerCase().includes(q))
        );
      });

    return { ok: true, items };
  }

  async importSelectedProducts(
    storeId: string,
    selections: {
      sku: string;
      name: string;
      stock: number;
      price: number;
      cost: number;
      alertOn?: number;
    }[],
  ) {
    let created = 0;
    let updated = 0;

    for (const s of selections) {
      if (!s.sku) continue;

      const existing = await this.prisma.product.findUnique({
        where: { storeId_sku: { storeId, sku: s.sku } },
      });

      if (existing) {
        await this.prisma.product.update({
          where: { id: existing.id },
          data: {
            name: s.name,
            quantityAvailable: s.stock,
            ...(s.price > 0 && { sellPrice: s.price }),
          },
        });
        updated++;
      } else {
        await this.prisma.product.create({
          data: {
            storeId,
            sku: s.sku,
            name: s.name,
            quantityAvailable: s.stock,
            lowStockThreshold: s.alertOn && s.alertOn > 0 ? s.alertOn : 5,
            sellPrice: s.price > 0 ? s.price : null,
          },
        });
        created++;
      }
    }

    return { ok: true, created, updated };
  }

  async importAllProducts(storeId: string) {
    const browse = await this.browseProducts(storeId);
    if (!browse.ok) return browse;

    const selections: any[] = [];
    for (const p of browse.items) {
      if (p.variants.length > 0) {
        p.variants.forEach((v: any) =>
          selections.push({
            sku: v.sku,
            name: `${p.name} - ${v.label}`,
            stock: v.stock,
            price: v.price,
            cost: 0,
            alertOn: 5,
          }),
        );
      } else {
        selections.push({
          sku: p.sku,
          name: p.name,
          stock: p.stock,
          price: p.price,
          cost: 0,
          alertOn: 5,
        });
      }
    }

    return this.importSelectedProducts(storeId, selections);
  }
}