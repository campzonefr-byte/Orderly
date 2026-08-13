import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { OrderStatus } from '@prisma/client';

const CONVERTY_BASE = 'https://partner.converty.shop';
const CONVERTY_API = `${CONVERTY_BASE}/api/v1`;
const CONVERTY_AUTH = `${CONVERTY_BASE}/oauth2/authorize`;
const CONVERTY_TOKEN = `${CONVERTY_BASE}/oauth2/token`;

const STATUS_MAP: Record<string, OrderStatus> = {
  pending: 'NOUVEAU',
  attempt: 'CONFIRMATION_EN_COURS',
  confirmed: 'A_PREPARER',
  exchange: 'ECHANGE',
  packed: 'EN_PREPARATION',
  uploaded: 'EMBALLE',
  'in transit': 'EN_COURS_DE_LIVRAISON',
  delivered: 'LIVRE',
  returned: 'RETOUR',
  rejected: 'ANNULE',
};

@Injectable()
export class ConvertyService {
  constructor(private prisma: PrismaService) {}

  private get clientId() {
    return process.env.CONVERTY_CLIENT_ID ?? '';
  }
  private get clientSecret() {
    return process.env.CONVERTY_CLIENT_SECRET ?? '';
  }
  private get redirectUri() {
    return process.env.CONVERTY_REDIRECT_URI ?? '';
  }

  getAuthUrl(storeId: string) {
    const scopes = [
      'read-orders',
      'create-orders',
      'update-orders',
      'read-products',
      'read-stores',
      'read-hooks',
      'create-hooks',
    ].join(' ');

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      scope: scopes,
      state: storeId,
    });

    return { url: `${CONVERTY_AUTH}?${params.toString()}` };
  }

  async handleCallback(code: string, storeId: string) {
    try {
      const body = new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        client_id: this.clientId,
        client_secret: this.clientSecret,
      });

      const res = await fetch(CONVERTY_TOKEN, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      });

      const data: any = await res.json();
      if (!res.ok || !data?.access_token) {
        return { ok: false, error: data?.message ?? `HTTP ${res.status}`, raw: data };
      }

      await this.saveTokens(storeId, data);
      return { ok: true };
    } catch (e: any) {
      return { ok: false, error: e?.message ?? 'Erreur reseau' };
    }
  }

  private async saveTokens(storeId: string, data: any) {
    const expiresAt = new Date(
      Date.now() + (Number(data.expires_in ?? 3600) - 300) * 1000,
    ).toISOString();

    const credentials = {
      accessToken: data.access_token,
      refreshToken: data.refresh_token ?? null,
      expiresAt,
    };

    const existing = await this.prisma.deliveryIntegration.findFirst({
      where: { storeId, provider: 'CONVERTY' },
    });

    if (existing) {
      return this.prisma.deliveryIntegration.update({
        where: { id: existing.id },
        data: { credentials, isActive: true },
      });
    }

    return this.prisma.deliveryIntegration.create({
      data: { storeId, provider: 'CONVERTY', credentials, isActive: true },
    });
  }

  private async getValidToken(storeId: string): Promise<string | null> {
    const integration = await this.prisma.deliveryIntegration.findFirst({
      where: { storeId, provider: 'CONVERTY', isActive: true },
    });
    if (!integration) return null;

    const creds = integration.credentials as any;
    if (!creds?.accessToken) return null;

    if (creds.expiresAt && new Date(creds.expiresAt) > new Date()) {
      return creds.accessToken;
    }
    if (!creds.refreshToken) return creds.accessToken;

    try {
      const body = new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: creds.refreshToken,
        client_id: this.clientId,
        client_secret: this.clientSecret,
      });

      const res = await fetch(CONVERTY_TOKEN, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      });

      const data: any = await res.json();
      if (!res.ok || !data?.access_token) return creds.accessToken;

      await this.saveTokens(storeId, {
        ...data,
        refresh_token: data.refresh_token ?? creds.refreshToken,
      });
      return data.access_token;
    } catch {
      return creds.accessToken;
    }
  }

  async getStatus(storeId: string) {
    const integration = await this.prisma.deliveryIntegration.findFirst({
      where: { storeId, provider: 'CONVERTY' },
    });
    if (!integration) return { connected: false, configured: !!this.clientId };

    const creds = integration.credentials as any;
    return {
      connected: integration.isActive && !!creds?.accessToken,
      configured: !!this.clientId,
      expiresAt: creds?.expiresAt ?? null,
      updatedAt: integration.updatedAt,
    };
  }

  async disconnect(storeId: string) {
    const integration = await this.prisma.deliveryIntegration.findFirst({
      where: { storeId, provider: 'CONVERTY' },
    });
    if (!integration) return { ok: true };
    await this.prisma.deliveryIntegration.update({
      where: { id: integration.id },
      data: { isActive: false },
    });
    return { ok: true };
  }

  async testConnection(storeId: string) {
    const token = await this.getValidToken(storeId);
    if (!token) return { ok: false, error: 'Non connecte' };
    try {
      const res = await fetch(`${CONVERTY_API}/stores/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      return { ok: res.ok, data };
    } catch (e: any) {
      return { ok: false, error: e?.message };
    }
  }

  async importProducts(storeId: string) {
    const token = await this.getValidToken(storeId);
    if (!token) return { ok: false, error: 'Converty non connecte' };

    try {
      const url = `${CONVERTY_API}/products?limit=250`;
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
      });

      const raw = await res.text();

      if (raw.trim().startsWith('<')) {
        return {
          ok: false,
          error: `Converty a renvoye du HTML (HTTP ${res.status})`,
          url,
          preview: raw.slice(0, 300),
        };
      }

      let data: any;
      try {
        data = JSON.parse(raw);
      } catch {
        return { ok: false, error: 'Reponse illisible', preview: raw.slice(0, 300) };
      }

      if (!res.ok) return { ok: false, error: `HTTP ${res.status}`, raw: data };

      const items: any[] = data?.data ?? data?.products ?? (Array.isArray(data) ? data : []);
      let created = 0;
      let updated = 0;

      for (const p of items) {
        const variants: any[] = p?.newVariants ?? [];
        const rows = variants.length
          ? variants.map((v) => ({
              sku: String(v.sku ?? v.id ?? p._id),
              name: `${p.name ?? 'Produit'}${
                v.selectedValues?.length ? ' - ' + v.selectedValues.join(' / ') : ''
              }`,
              qty: Number(v.stock?.quantity ?? 0),
              alert: Number(v.stock?.alertOn ?? 5),
            }))
          : [
              {
                sku: String(p.sku ?? p._id),
                name: p.name ?? 'Produit',
                qty: Number(p.stock ?? 0),
                alert: 5,
              },
            ];

        for (const r of rows) {
          if (!r.sku) continue;
          const existing = await this.prisma.product.findUnique({
            where: { storeId_sku: { storeId, sku: r.sku } },
          });
          if (existing) {
            await this.prisma.product.update({
              where: { id: existing.id },
              data: { name: r.name, quantityAvailable: r.qty },
            });
            updated++;
          } else {
            await this.prisma.product.create({
              data: {
                storeId,
                sku: r.sku,
                name: r.name,
                quantityAvailable: r.qty,
                lowStockThreshold: r.alert > 0 ? r.alert : 5,
              },
            });
            created++;
          }
        }
      }

      return { ok: true, created, updated, total: items.length };
    } catch (e: any) {
      return { ok: false, error: e?.message ?? 'Erreur reseau' };
    }
  }

  async importOrders(storeId: string, limit = 100) {
    const token = await this.getValidToken(storeId);
    if (!token) return { ok: false, error: 'Converty non connecte' };

    try {
      const url = `${CONVERTY_API}/orders?limit=${limit}`;
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
      });

      const raw = await res.text();

      // Converty returned HTML instead of JSON
      if (raw.trim().startsWith('<')) {
        return {
          ok: false,
          error: `Converty a renvoye du HTML (HTTP ${res.status})`,
          url,
          preview: raw.slice(0, 300),
        };
      }

      let data: any;
      try {
        data = JSON.parse(raw);
      } catch {
        return { ok: false, error: 'Reponse illisible', preview: raw.slice(0, 300) };
      }

      if (!res.ok) {
        return { ok: false, error: `HTTP ${res.status}`, raw: data };
      }

      const items: any[] =
        data?.data ?? data?.orders ?? data?.results ?? (Array.isArray(data) ? data : []);

      let created = 0;
      let skipped = 0;

      for (const o of items) {
        const r = await this.upsertOrder(storeId, o);
        if (r.created) created++;
        else skipped++;
      }

      return { ok: true, created, skipped, total: items.length };
    } catch (e: any) {
      return { ok: false, error: e?.message ?? 'Erreur reseau' };
    }
  }

  private async upsertOrder(storeId: string, o: any) {
    const externalId = String(o?._id ?? o?.id ?? '');
    if (!externalId) return { created: false };

    const rawStatus = String(o?.status ?? 'pending').toLowerCase();
    const mapped = STATUS_MAP[rawStatus] ?? 'NOUVEAU';

    const existing = await this.prisma.order.findUnique({
      where: { storeId_externalOrderId: { storeId, externalOrderId: externalId } },
    });

    if (existing) {
      const protectedStatuses: OrderStatus[] = [
        'A_PREPARER', 'EN_PREPARATION', 'EMBALLE', 'AU_DEPOT_LIVREUR', 'PAYE', 'ARCHIVE',
      ];
      if (!protectedStatuses.includes(existing.orderStatus) && mapped !== existing.orderStatus) {
        await this.prisma.order.update({
          where: { id: existing.id },
          data: { orderStatus: mapped },
        });
      }
      return { created: false };
    }

    const cart: any[] = o?.cart ?? [];
    const lineItems = cart.map((c) => {
      const variant = (c.selectedVariants ?? [])
        .map((v: any) => v.value)
        .filter(Boolean)
        .join(' / ');
      return {
        title: c.product?.name ?? 'Produit',
        sku: c.product?.sku ? String(c.product.sku) : null,
        variantTitle: variant || null,
        quantity: Number(c.quantity ?? 1),
        price: Number(c.pricePerUnit ?? c.product?.price ?? 0),
        fulfilledQty: 0,
        refundedQty: 0,
      };
    });

    const total = Number(o?.total?.totalPrice ?? 0);
    const deliveryPrice = Number(o?.total?.deliveryPrice ?? 0);
    const subtotal = Math.max(0, total - deliveryPrice);

    const cust = o?.customer ?? {};
    const isExchange = o?.exchange === true;

    await this.prisma.order.create({
      data: {
        storeId,
        externalOrderId: externalId,
        orderNumber: o?.reference ? `#${o.reference}` : `#C-${externalId.slice(-6)}`,
        orderStatus: isExchange ? 'ECHANGE' : mapped,
        financialStatus: o?.paymentStatus === 'paid' ? 'PAID' : 'PENDING',
        fulfillmentStatus: 'UNFULFILLED',
        customerName: cust.name ?? null,
        customerPhone: cust.phone ?? null,
        customerPhone2: cust.phone2 || null,
        customerEmail: cust.email || null,
        shippingAddress: {
          address1: cust.address ?? '',
          city: cust.city ?? '',
          province: cust.town ?? '',
        },
        currency: 'TND',
        subtotal,
        taxTotal: 0,
        shippingTotal: deliveryPrice,
        total,
        totalRefunded: 0,
        tags: isExchange ? ['Converty', 'Échange'] : ['Converty'],
        notes: cust.note || null,
        deliveryCompany: o?.deliveryCompany ?? null,
        sourceCreatedAt: o?.createdAt ? new Date(o.createdAt) : new Date(),
        lineItems: { create: lineItems },
      },
    });

    return { created: true };
  }

  async registerWebhooks(storeId: string) {
    const token = await this.getValidToken(storeId);
    if (!token) return { ok: false, error: 'Converty non connecte' };

    const base = (this.redirectUri ?? '').replace(
      '/integrations/converty/callback',
      '',
    );

    const hooks = [
      { event: 'order.create', targetUrl: `${base}/webhooks/converty/${storeId}/order-create` },
      { event: 'order.update', targetUrl: `${base}/webhooks/converty/${storeId}/order-update` },
    ];

    const results: any[] = [];
    for (const h of hooks) {
      try {
        const res = await fetch(`${CONVERTY_API}/hooks/subscribe`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(h),
        });
        const body = await res.json().catch(() => ({}));
        results.push({ event: h.event, ok: res.ok, status: res.status, body });
      } catch (e: any) {
        results.push({ event: h.event, ok: false, error: e?.message });
      }
    }

    return { ok: results.every((r) => r.ok), results };
  }

  async handleWebhook(storeId: string, payload: any) {
    const order = payload?.data ?? payload?.order ?? payload;
    const r = await this.upsertOrder(storeId, order);
    return { ok: true, ...r };
  }
  async debugRaw(storeId: string, path: string) {
    const token = await this.getValidToken(storeId);
    if (!token) return { ok: false, error: 'Non connecte' };

    const url = path.startsWith('http') ? path : `${CONVERTY_API}${path}`;
    try {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      });
      const raw = await res.text();
      return {
        ok: res.ok,
        status: res.status,
        contentType: res.headers.get('content-type'),
        url,
        preview: raw.slice(0, 800),
      };
    } catch (e: any) {
      return { ok: false, error: e?.message, url };
    }
  }
}