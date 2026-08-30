import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { OrderStatus } from '@prisma/client';

const COSMOS_BASE = 'https://api.cosmos.tn/api/v1';

export const COSMOS_CITIES = [
  'Ariana', 'Ben Arous', 'Manouba', 'Tunis', 'Sfax', 'Kairouan', 'Gafsa',
  'Gabes', 'Bizerte', 'Beja', 'Jendouba', 'Kasserine', 'Kebili', 'Kef',
  'Mahdia', 'Medenine', 'Monastir', 'Nabeul', 'Sidi Bouzid', 'Siliana',
  'Sousse', 'Tataouine', 'Tozeur', 'Zaghouan',
];

const STATUS_MAP: Record<string, OrderStatus> = {
  pending: 'AU_DEPOT_LIVREUR',
  'to-be-picked': 'AU_DEPOT_LIVREUR',
  'in-depot': 'AU_DEPOT_LIVREUR',
  'in-transfer': 'EN_COURS_DE_LIVRAISON',
  'in-delivery': 'EN_COURS_DE_LIVRAISON',
  'to-be-verified': 'A_VERIFIER',
  delivered: 'LIVRE',
  'return-stock': 'RETOUR_DEPOT',
  'return-in-transfer': 'RETOUR_DEPOT',
  'final-return': 'RETOUR',
  'received-return': 'RETOUR_RECU',
};

function normalizeCity(raw?: string | null): string | null {
  if (!raw) return null;
  const clean = raw.trim().toLowerCase().replace(/[éèê]/g, 'e').replace(/\s+/g, ' ');
  const found = COSMOS_CITIES.find(
    (c) => c.toLowerCase().replace(/[éèê]/g, 'e') === clean,
  );
  if (found) return found;
  const partial = COSMOS_CITIES.find(
    (c) => clean.includes(c.toLowerCase()) || c.toLowerCase().includes(clean),
  );
  return partial ?? null;
}

@Injectable()
export class CosmosService {
  constructor(private prisma: PrismaService) {}

  private async getConfig(storeId: string) {
    const link = await this.prisma.deliveryIntegrationStore.findFirst({
      where: { storeId },
      include: { integration: true },
    });

    if (!link) return null;
    const creds = link.integration.credentials as any;
    if (!creds?.token) return null;

    return {
      token: creds.token as string,
      integrationId: link.integrationId,
    };
  }

  async saveConfig(integrationId: string, token: string) {
    return this.prisma.deliveryIntegration.update({
      where: { id: integrationId },
      data: { credentials: { token }, isActive: true },
    });
  }

  async getStatus(storeId: string) {
    const link = await this.prisma.deliveryIntegrationStore.findFirst({
      where: { storeId, integration: { provider: 'COSMOS' } },
      include: { integration: true },
    });
    if (!link) return { connected: false };
    const creds = link.integration.credentials as any;
    return {
      connected: link.integration.isActive && !!creds?.token,
      hasToken: !!creds?.token,
      integrationName: link.integration.name,
      updatedAt: link.integration.updatedAt,
    };
  }

  async testConnection(storeId: string) {
    const config = await this.getConfig(storeId);
    if (!config?.token) return { ok: false, error: 'Aucun token configure' };

    try {
      const res = await fetch(`${COSMOS_BASE}/orders?page=1&limit=1`, {
        headers: {
          Authorization: `Bearer ${config.token}`,
          'Content-Type': 'application/json',
        },
      });
      const raw = await res.text();
      if (raw.trim().startsWith('<')) {
        return { ok: false, error: `HTML recu (HTTP ${res.status})`, preview: raw.slice(0, 200) };
      }
      const data = JSON.parse(raw);
      if (!res.ok) return { ok: false, error: data?.message ?? `HTTP ${res.status}` };
      return { ok: true, message: `Connexion reussie · ${data?.count ?? 0} commandes visibles` };
    } catch (e: any) {
      return { ok: false, error: e?.message ?? 'Erreur reseau' };
    }
  }

  async createShipment(orderId: string, actorId?: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { lineItems: true },
    });
    if (!order) return { ok: false, error: 'Commande introuvable' };

    const existing = await this.prisma.fulfillment.findFirst({
      where: { orderId, carrier: 'COSMOS' },
    });
    if (existing?.deliveryPartnerRef) {
      return { ok: true, alreadySent: true, barcode: existing.deliveryPartnerRef };
    }

    const config = await this.getConfig(order.storeId);
    if (!config?.token) return { ok: false, error: 'Cosmos non configure pour ce magasin' };

    const addr = order.shippingAddress as any;
    const city = normalizeCity(addr?.city);
    if (!city) {
      return {
        ok: false,
        error: `Ville non reconnue par Cosmos : "${addr?.city ?? 'vide'}"`,
        acceptedCities: COSMOS_CITIES,
      };
    }

    const isExchange =
      order.orderStatus === 'ECHANGE' || (order.tags ?? []).includes('Échange');

    const content = order.lineItems
      .map((li) => `${li.title}${li.variantTitle ? ' - ' + li.variantTitle : ''} x${li.quantity}`)
      .join(', ');
    const quantity = order.lineItems.reduce((s, li) => s + li.quantity, 0);

    let note = '';
    if (order.internalNote && !order.internalNote.trim().startsWith('{')) {
      note = order.internalNote;
    }

    const payload = {
      name: order.customerName ?? 'Client',
      phone: (order.customerPhone ?? '').replace(/\s/g, '').replace(/^\+?216/, ''),
      phone2: (order.customerPhone2 ?? '').replace(/\s/g, '') || undefined,
      address: addr?.address1 || 'Adresse non precisee',
      city,
      quantity: Math.max(1, quantity),
      packageCount: 1,
      totalAmount: Number(order.total),
      content: content || 'Commande',
      note,
      externalBarcode: order.orderNumber.replace('#', ''),
      exchange: isExchange,
      source: 'orderly',
      options: { allowToOpen: true, isFragile: false },
    };

    try {
      const res = await fetch(`${COSMOS_BASE}/orders`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const raw = await res.text();
      let data: any = {};
      try {
        data = JSON.parse(raw);
      } catch {
        return { ok: false, error: 'Reponse illisible', preview: raw.slice(0, 300) };
      }

      if (!res.ok || !data?.success) {
        await this.prisma.orderEvent.create({
          data: {
            orderId,
            eventType: 'cosmos_error',
            payload: { status: res.status, response: data, sent: payload },
            actor: actorId ?? 'system',
          },
        });
        return { ok: false, error: data?.message ?? `HTTP ${res.status}`, detail: data };
      }

      const d = data.data ?? {};
      const barcode = d.barcode ?? d.id ?? null;

      await this.prisma.fulfillment.create({
        data: {
          orderId,
          carrier: 'COSMOS',
          trackingNumber: barcode ? String(barcode) : null,
          trackingUrl: d.labelPdfUrl ?? d.labelUrl ?? null,
          status: d.status ?? 'pending',
          deliveryPartnerRef: barcode ? String(barcode) : null,
        },
      });

      await this.prisma.orderEvent.create({
        data: {
          orderId,
          eventType: 'cosmos_shipment_created',
          payload: { barcode, labelUrl: d.labelUrl, labelPdfUrl: d.labelPdfUrl },
          actor: actorId ?? 'system',
        },
      });

      return {
        ok: true,
        barcode,
        labelUrl: d.labelUrl ?? null,
        labelPdfUrl: d.labelPdfUrl ?? null,
      };
    } catch (e: any) {
      return { ok: false, error: e?.message ?? 'Erreur reseau' };
    }
  }

  async syncStatuses(storeId: string) {
    const config = await this.getConfig(storeId);
    if (!config?.token) return { ok: false, error: 'Cosmos non configure' };

    const orders = await this.prisma.order.findMany({
      where: {
        storeId,
        orderStatus: {
          in: [
            'AU_DEPOT_LIVREUR', 'EN_COURS_DE_LIVRAISON', 'LIVRE',
            'RETOUR', 'RETOUR_DEPOT', 'A_VERIFIER', 'EMBALLE',
          ],
        },
      },
      include: { fulfillments: { where: { carrier: 'COSMOS' }, take: 1 } },
    });

    const withBarcode = orders.filter((o) => o.fulfillments[0]?.deliveryPartnerRef);
    if (withBarcode.length === 0) return { ok: true, checked: 0, updated: 0 };

    let updated = 0;
    let checked = 0;

    // Cosmos accepts comma-separated barcodes, batch by 50
    for (let i = 0; i < withBarcode.length; i += 50) {
      const batch = withBarcode.slice(i, i + 50);
      const barcodes = batch
        .map((o) => o.fulfillments[0].deliveryPartnerRef)
        .filter(Boolean)
        .join(',');

      try {
        const res = await fetch(
          `${COSMOS_BASE}/orders?limit=100&barcode=${encodeURIComponent(barcodes)}`,
          { headers: { Authorization: `Bearer ${config.token}` } },
        );
        if (!res.ok) continue;

        const data: any = await res.json();
        const items: any[] = data?.data ?? [];

        for (const item of items) {
          checked++;
          const ref = String(item.id ?? '');
          const order = batch.find((o) => o.fulfillments[0]?.deliveryPartnerRef === ref);
          if (!order) continue;

          let mapped = STATUS_MAP[String(item.status ?? '').toLowerCase()];

          // Payment status wins when delivered and paid
          if (item.paymentStatus === 'paid' && mapped === 'LIVRE') {
            mapped = 'PAYE';
          }

          if (!mapped || mapped === order.orderStatus) continue;
          if (order.orderStatus === 'PAYE' && mapped !== 'PAYE') continue;

          await this.prisma.order.update({
            where: { id: order.id },
            data: {
              orderStatus: mapped,
              ...(mapped === 'PAYE' && { financialStatus: 'PAID' }),
            },
          });

          await this.prisma.fulfillment.updateMany({
            where: { orderId: order.id, carrier: 'COSMOS' },
            data: { status: item.status },
          });

          await this.prisma.orderEvent.create({
            data: {
              orderId: order.id,
              eventType: 'status_changed',
              payload: { to: mapped, source: 'cosmos', rawStatus: item.status },
              actor: 'system:cosmos',
            },
          });

          updated++;
        }
      } catch {}
    }

    return { ok: true, checked, updated };
  }

  async getLabelUrl(orderId: string) {
    const f = await this.prisma.fulfillment.findFirst({
      where: { orderId, carrier: 'COSMOS' },
    });
    if (!f?.deliveryPartnerRef) return { ok: false, error: 'Pas de colis Cosmos' };
    return {
      ok: true,
      barcode: f.deliveryPartnerRef,
      html: `${COSMOS_BASE}/labels?barcode=${f.deliveryPartnerRef}&format=html`,
      pdf: `${COSMOS_BASE}/labels?barcode=${f.deliveryPartnerRef}&format=pdf`,
      stored: f.trackingUrl,
    };
  }

  async deleteShipment(orderId: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) return { ok: false, error: 'Commande introuvable' };

    const config = await this.getConfig(order.storeId);
    if (!config?.token) return { ok: false, error: 'Cosmos non configure' };

    const f = await this.prisma.fulfillment.findFirst({
      where: { orderId, carrier: 'COSMOS' },
    });
    if (!f?.deliveryPartnerRef) return { ok: false, error: 'Pas de colis a supprimer' };

    try {
      const res = await fetch(
        `${COSMOS_BASE}/orders?barcode=${f.deliveryPartnerRef}`,
        {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${config.token}` },
        },
      );
      const data: any = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) {
        return { ok: false, error: data?.message ?? `HTTP ${res.status}` };
      }

      await this.prisma.fulfillment.delete({ where: { id: f.id } });
      return { ok: true };
    } catch (e: any) {
      return { ok: false, error: e?.message };
    }
  }

  async trackOrder(storeId: string, barcode: string) {
    const config = await this.getConfig(storeId);
    if (!config?.token) return { ok: false, error: 'Cosmos non configure' };
    try {
      const res = await fetch(`${COSMOS_BASE}/orders?barcode=${barcode}`, {
        headers: { Authorization: `Bearer ${config.token}` },
      });
      const data = await res.json();
      return { ok: res.ok, data };
    } catch (e: any) {
      return { ok: false, error: e?.message };
    }
  }

  getCities() {
    return COSMOS_CITIES;
  }
  async fetchLabel(storeId: string, barcode: string, format: 'html' | 'pdf' = 'pdf') {
    const config = await this.getConfig(storeId);
    if (!config?.token) return { ok: false, error: 'Cosmos non configure' };

    try {
      const res = await fetch(
        `${COSMOS_BASE}/labels?barcode=${encodeURIComponent(barcode)}&format=${format}`,
        { headers: { Authorization: `Bearer ${config.token}` } },
      );

      if (!res.ok) {
        return { ok: false, error: `HTTP ${res.status}` };
      }

      const buffer = Buffer.from(await res.arrayBuffer());
      return {
        ok: true,
        buffer,
        contentType: res.headers.get('content-type') ?? (format === 'pdf' ? 'application/pdf' : 'text/html'),
      };
    } catch (e: any) {
      return { ok: false, error: e?.message ?? 'Erreur reseau' };
    }
  }
  async listIntegrations() {
    return this.prisma.deliveryIntegration.findMany({
      where: { provider: 'COSMOS' },
      include: {
        stores: {
          include: { store: { select: { id: true, name: true } } },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async createIntegration(name: string, token: string) {
    return this.prisma.deliveryIntegration.create({
      data: {
        name,
        provider: 'COSMOS',
        credentials: { token },
        isActive: true,
      },
    });
  }

  async deleteIntegration(id: string) {
    return this.prisma.deliveryIntegration.delete({ where: { id } });
  }

  async linkStore(integrationId: string, storeId: string) {
    // A store can only be linked to one delivery integration
    await this.prisma.deliveryIntegrationStore.deleteMany({
      where: { storeId },
    });
    return this.prisma.deliveryIntegrationStore.create({
      data: { integrationId, storeId },
    });
  }

  async unlinkStore(integrationId: string, storeId: string) {
    return this.prisma.deliveryIntegrationStore.deleteMany({
      where: { integrationId, storeId },
    });
  }

  async updateToken(integrationId: string, token: string) {
    const integration = await this.prisma.deliveryIntegration.findUnique({
      where: { id: integrationId },
    });
    const existing = (integration?.credentials as any) ?? {};
    return this.prisma.deliveryIntegration.update({
      where: { id: integrationId },
      data: { credentials: { ...existing, token } },
    });
  }

  async testConnectionById(integrationId: string) {
    const integration = await this.prisma.deliveryIntegration.findUnique({
      where: { id: integrationId },
    });
    if (!integration) return { ok: false, error: 'Integration introuvable' };
    const creds = integration.credentials as any;
    if (!creds?.token) return { ok: false, error: 'Token manquant' };

    try {
      const res = await fetch(`${COSMOS_BASE}/orders?page=1&limit=1`, {
        headers: { Authorization: `Bearer ${creds.token}` },
      });
      const raw = await res.text();
      if (raw.trim().startsWith('<')) {
        return { ok: false, error: `HTML recu (HTTP ${res.status})` };
      }
      const data = JSON.parse(raw);
      if (!res.ok) return { ok: false, error: data?.message ?? `HTTP ${res.status}` };
      return { ok: true, message: `Connexion reussie · ${data?.count ?? 0} commandes` };
    } catch (e: any) {
      return { ok: false, error: e?.message ?? 'Erreur reseau' };
    }
  }

  async syncAllStores() {
    const integrations = await this.prisma.deliveryIntegration.findMany({
      where: { provider: 'COSMOS', isActive: true },
      include: { stores: { select: { storeId: true } } },
    });

    let totalChecked = 0;
    let totalUpdated = 0;

    for (const integration of integrations) {
      for (const { storeId } of integration.stores) {
        const r: any = await this.syncStatuses(storeId);
        if (r?.ok) {
          totalChecked += r.checked ?? 0;
          totalUpdated += r.updated ?? 0;
        }
      }
    }

    return { ok: true, checked: totalChecked, updated: totalUpdated };
  }
}
