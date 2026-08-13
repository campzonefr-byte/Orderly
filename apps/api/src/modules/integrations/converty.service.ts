import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { OrderStatus } from '@prisma/client';

const CONVERTY_API = 'https://api.converty.shop/api/v1';
const CONVERTY_AUTH = 'https://app.converty.shop/oauth/authorize';
const CONVERTY_TOKEN = 'https://api.converty.shop/api/v1/oauth/token';

const STATUS_MAP: Record<string, OrderStatus> = {
  pending: 'NOUVEAU',
  attempt: 'CONFIRMATION_EN_COURS',
  confirmed: 'A_PREPARER',
  exchange: 'ECHANGE',
  uploaded: 'EMBALLE',
  packed: 'EN_PREPARATION',
  'in transit': 'EN_COURS_DE_LIVRAISON',
  in_transit: 'EN_COURS_DE_LIVRAISON',
  delivered: 'LIVRE',
  paid: 'PAYE',
  returned: 'RETOUR',
  rejected: 'ANNULE',
  cancelled: 'ANNULE',
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
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      response_type: 'code',
      scope: scopes,
      state: storeId,
    });

    return { url: `${CONVERTY_AUTH}?${params.toString()}` };
  }

  async handleCallback(code: string, storeId: string) {
    try {
      const res = await fetch(CONVERTY_TOKEN, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          grant_type: 'authorization_code',
          client_id: this.clientId,
          client_secret: this.clientSecret,
          redirect_uri: this.redirectUri,
          code,
        }),
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
      scope: data.scope ?? null,
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

    // Still valid?
    if (creds.expiresAt && new Date(creds.expiresAt) > new Date()) {
      return creds.accessToken;
    }

    // Refresh
    if (!creds.refreshToken) return creds.accessToken;

    try {
      const res = await fetch(CONVERTY_TOKEN, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          grant_type: 'refresh_token',
          client_id: this.clientId,
          client_secret: this.clientSecret,
          refresh_token: creds.refreshToken,
        }),
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
      scope: creds?.scope ?? null,
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

  async importProducts(storeId: string) {
    const token = await this.getValidToken(storeId);
    if (!token) return { ok: false, error: 'Converty non connecte' };

    try {
      const res = await fetch(`${CONVERTY_API}/products?limit=250`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data: any = await res.json();
      if (!res.ok) return { ok: false, error: `HTTP ${res.status}`, raw: data };

      const items: any[] = data?.data ?? data?.products ?? (Array.isArray(data) ? data : []);
      let created = 0;
      let updated = 0;

      for (const p of items) {
        const variants: any[] = p?.variants ?? [];
        const rows = variants.length
          ? variants.map((v) => ({
              sku: String(v.sku ?? v._id ?? p._id),
              name: `${p.name ?? p.title ?? 'Produit'}${v.name ? ' - ' + v.name : ''}`,
              qty: Number(v.quantity ?? v.stock ?? 0),
            }))
          : [
              {
                sku: String(p.sku ?? p._id),
                name: p.name ?? p.title ?? 'Produit',
                qty: Number(p.quantity ?? p.stock ?? 0),
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
                lowStockThreshold: 5,
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
      const res = await fetch(`${CONVERTY_API}/orders?limit=${limit}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data: any = await res.json();
      if (!res.ok) return { ok: false, error: `HTTP ${res.status}`, raw: data };

      const items: any[] = data?.data ?? data?.orders ?? (Array.isArray(data) ? data : []);
      let created = 0;
      let skipped = 0;

      for (const o of items) {
        const externalId = String(o._id ?? o.id ?? '');
        if (!externalId) continue;

        const exists = await this.prisma.order.findUnique({
          where: { storeId_externalOrderId: { storeId, externalOrderId: externalId } },
        });
        if (exists) {
          skipped++;
          continue;
        }

        const rawStatus = String(o.status ?? 'pending').toLowerCase();
        const orderStatus = STATUS_MAP[rawStatus] ?? 'NOUVEAU';

        const items2: any[] = o.items ?? o.products ?? [];
        const lineItems = items2.map((li) => ({
          title: li.name ?? li.title ?? 'Produit',
          sku: li.sku ? String(li.sku) : null,
          variantTitle: li.variant ?? li.variantName ?? null,
          quantity: Number(li.quantity ?? 1),
          price: Number(li.price ?? 0),
          fulfilledQty: 0,
          refundedQty: 0,
        }));

        const total = Number(o.total?.totalPrice ?? o.totalAmount ?? o.total ?? 0);
        const subtotal = Number(o.total?.subTotal ?? total);

        await this.prisma.order.create({
          data: {
            storeId,
            externalOrderId: externalId,
            orderNumber: o.orderNumber ? `#${o.orderNumber}` : `#C-${externalId.slice(-6)}`,
            orderStatus,
            financialStatus: orderStatus === 'PAYE' ? 'PAID' : 'PENDING',
            fulfillmentStatus: 'UNFULFILLED',
            customerName: o.customer?.name ?? o.name ?? null,
            customerPhone: o.customer?.phone ?? o.phone ?? null,
            customerPhone2: o.customer?.phone2 ?? o.phone2 ?? null,
            shippingAddress: {
              address1: o.customer?.address ?? o.address ?? '',
              city: o.customer?.city ?? o.city ?? '',
            },
            currency: 'TND',
            subtotal,
            taxTotal: 0,
            shippingTotal: Number(o.total?.deliveryPrice ?? 0),
            total,
            totalRefunded: 0,
            tags: ['Converty'],
            deliveryCompany: o.deliveryCompany ?? null,
            sourceCreatedAt: o.createdAt ? new Date(o.createdAt) : new Date(),
            lineItems: { create: lineItems },
          },
        });
        created++;
      }

      return { ok: true, created, skipped, total: items.length };
    } catch (e: any) {
      return { ok: false, error: e?.message ?? 'Erreur reseau' };
    }
  }

  async registerWebhooks(storeId: string) {
    const token = await this.getValidToken(storeId);
    if (!token) return { ok: false, error: 'Converty non connecte' };

    const base = (process.env.CONVERTY_REDIRECT_URI ?? '').replace(
      '/integrations/converty/callback',
      '',
    );

    const hooks = [
      { event: 'order.create', url: `${base}/webhooks/converty/${storeId}/order-create` },
      { event: 'order.update', url: `${base}/webhooks/converty/${storeId}/order-update` },
    ];

    const results: any[] = [];
    for (const h of hooks) {
      try {
        const res = await fetch(`${CONVERTY_API}/hooks`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ event: h.event, url: h.url }),
        });
        results.push({ event: h.event, ok: res.ok, status: res.status });
      } catch (e: any) {
        results.push({ event: h.event, ok: false, error: e?.message });
      }
    }

    return { ok: results.every((r) => r.ok), results };
  }

  async handleWebhook(storeId: string, payload: any) {
    const externalId = String(payload?._id ?? payload?.id ?? '');
    if (!externalId) return { ok: false, error: 'Pas d id' };

    const rawStatus = String(payload?.status ?? 'pending').toLowerCase();
    const mapped = STATUS_MAP[rawStatus] ?? 'NOUVEAU';

    const existing = await this.prisma.order.findUnique({
      where: { storeId_externalOrderId: { storeId, externalOrderId: externalId } },
    });

    if (existing) {
      // Do not override work done by our team
      const protectedStatuses: OrderStatus[] = [
        'A_PREPARER', 'EN_PREPARATION', 'EMBALLE', 'AU_DEPOT_LIVREUR', 'PAYE',
      ];
      if (protectedStatuses.includes(existing.orderStatus)) {
        return { ok: true, skipped: true };
      }
      await this.prisma.order.update({
        where: { id: existing.id },
        data: { orderStatus: mapped },
      });
      return { ok: true, updated: true };
    }

    const items: any[] = payload?.items ?? payload?.products ?? [];
    const total = Number(payload?.total?.totalPrice ?? payload?.totalAmount ?? 0);

    await this.prisma.order.create({
      data: {
        storeId,
        externalOrderId: externalId,
        orderNumber: payload?.orderNumber ? `#${payload.orderNumber}` : `#C-${externalId.slice(-6)}`,
        orderStatus: mapped,
        financialStatus: 'PENDING',
        fulfillmentStatus: 'UNFULFILLED',
        customerName: payload?.customer?.name ?? payload?.name ?? null,
        customerPhone: payload?.customer?.phone ?? payload?.phone ?? null,
        customerPhone2: payload?.customer?.phone2 ?? null,
        shippingAddress: {
          address1: payload?.customer?.address ?? payload?.address ?? '',
          city: payload?.customer?.city ?? payload?.city ?? '',
        },
        currency: 'TND',
        subtotal: total,
        taxTotal: 0,
        shippingTotal: 0,
        total,
        totalRefunded: 0,
        tags: ['Converty'],
        sourceCreatedAt: payload?.createdAt ? new Date(payload.createdAt) : new Date(),
        lineItems: {
          create: items.map((li) => ({
            title: li.name ?? li.title ?? 'Produit',
            sku: li.sku ? String(li.sku) : null,
            quantity: Number(li.quantity ?? 1),
            price: Number(li.price ?? 0),
            fulfilledQty: 0,
            refundedQty: 0,
          })),
        },
      },
    });

    return { ok: true, created: true };
  }
}