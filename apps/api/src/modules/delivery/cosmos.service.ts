import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { OrderStatus } from '@prisma/client';

const COSMOS_BASE = 'https://api.cosmos.tn/api/v1';

// Mapping Cosmos → Orderly (à ajuster quand Cosmos confirme leurs statuts)
const STATUS_MAP: Record<string, OrderStatus> = {
  created: 'AU_DEPOT_LIVREUR',
  pending: 'AU_DEPOT_LIVREUR',
  picked_up: 'AU_DEPOT_LIVREUR',
  at_depot: 'AU_DEPOT_LIVREUR',
  in_transit: 'EN_COURS_DE_LIVRAISON',
  out_for_delivery: 'EN_COURS_DE_LIVRAISON',
  delivered: 'LIVRE',
  paid: 'PAYE',
  returned: 'RETOUR',
  return_depot: 'RETOUR_DEPOT',
  cancelled: 'ANNULE',
};

@Injectable()
export class CosmosService {
  constructor(private prisma: PrismaService) {}

  private async getConfig(storeId: string) {
    const integration = await this.prisma.deliveryIntegration.findFirst({
      where: { storeId, provider: 'COSMOS', isActive: true },
    });
    if (!integration) return null;
    const creds = integration.credentials as any;
    return { token: creds?.token as string, integrationId: integration.id };
  }

  async saveConfig(storeId: string, token: string) {
    const existing = await this.prisma.deliveryIntegration.findFirst({
      where: { storeId, provider: 'COSMOS' },
    });

    if (existing) {
      return this.prisma.deliveryIntegration.update({
        where: { id: existing.id },
        data: { credentials: { token }, isActive: true },
      });
    }

    return this.prisma.deliveryIntegration.create({
      data: {
        storeId,
        provider: 'COSMOS',
        credentials: { token },
        isActive: true,
      },
    });
  }

  async getStatus(storeId: string) {
    const integration = await this.prisma.deliveryIntegration.findFirst({
      where: { storeId, provider: 'COSMOS' },
    });
    if (!integration) return { connected: false };
    const creds = integration.credentials as any;
    return {
      connected: integration.isActive && !!creds?.token,
      isActive: integration.isActive,
      hasToken: !!creds?.token,
      updatedAt: integration.updatedAt,
    };
  }

  async testConnection(storeId: string) {
    const config = await this.getConfig(storeId);
    if (!config?.token) return { ok: false, error: 'Aucun token configure' };

    try {
      const res = await fetch(`${COSMOS_BASE}/orders?limit=1`, {
        headers: { Authorization: `Bearer ${config.token}` },
      });
      if (res.ok) return { ok: true, message: 'Connexion reussie' };
      return { ok: false, error: `HTTP ${res.status}`, detail: await res.text() };
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

    // Already sent?
    const existing = await this.prisma.fulfillment.findFirst({
      where: { orderId, carrier: 'COSMOS' },
    });
    if (existing?.deliveryPartnerRef) {
      return { ok: true, alreadySent: true, barcode: existing.deliveryPartnerRef };
    }

    const config = await this.getConfig(order.storeId);
    if (!config?.token) return { ok: false, error: 'Cosmos non configure pour ce magasin' };

    const addr = order.shippingAddress as any;
    const content = order.lineItems
      .map((li) => `${li.title}${li.variantTitle ? ' - ' + li.variantTitle : ''} x${li.quantity}`)
      .join(', ');
    const quantity = order.lineItems.reduce((s, li) => s + li.quantity, 0);

    const payload = {
      name: order.customerName ?? '',
      phone: (order.customerPhone ?? '').replace(/\s/g, ''),
      phone2: (order.customerPhone2 ?? '').replace(/\s/g, '') || undefined,
      address: addr?.address1 ?? '',
      city: addr?.city ?? '',
      totalAmount: Number(order.total),
      quantity,
      content,
      note: typeof order.internalNote === 'string' && !order.internalNote.startsWith('{')
        ? order.internalNote
        : '',
      options: { allowToOpen: true },
      source: 'orderly',
      externalBarcode: order.orderNumber.replace('#', ''),
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

      const data: any = await res.json().catch(() => ({}));

      if (!res.ok) {
        await this.prisma.orderEvent.create({
          data: {
            orderId,
            eventType: 'cosmos_error',
            payload: { status: res.status, response: data },
            actor: actorId ?? 'system',
          },
        });
        return { ok: false, error: `HTTP ${res.status}`, detail: data };
      }

      const barcode =
        data?.barcode ?? data?.data?.barcode ?? data?.trackingId ?? data?.id ?? null;

      await this.prisma.fulfillment.create({
        data: {
          orderId,
          carrier: 'COSMOS',
          trackingNumber: barcode ? String(barcode) : null,
          status: 'created',
          deliveryPartnerRef: barcode ? String(barcode) : null,
        },
      });

      await this.prisma.orderEvent.create({
        data: {
          orderId,
          eventType: 'cosmos_shipment_created',
          payload: { barcode, response: data },
          actor: actorId ?? 'system',
        },
      });

      return { ok: true, barcode, response: data };
    } catch (e: any) {
      return { ok: false, error: e?.message ?? 'Erreur reseau' };
    }
  }

  async syncStatuses(storeId: string) {
    const config = await this.getConfig(storeId);
    if (!config?.token) return { ok: false, error: 'Cosmos non configure' };

    // Orders currently at the courier
    const orders = await this.prisma.order.findMany({
      where: {
        storeId,
        orderStatus: {
          in: ['AU_DEPOT_LIVREUR', 'EN_COURS_DE_LIVRAISON', 'LIVRE', 'RETOUR', 'RETOUR_DEPOT'],
        },
      },
      include: { fulfillments: { where: { carrier: 'COSMOS' }, take: 1 } },
    });

    let updated = 0;
    let checked = 0;

    for (const order of orders) {
      const barcode = order.fulfillments[0]?.deliveryPartnerRef;
      if (!barcode) continue;
      checked++;

      try {
        const res = await fetch(`${COSMOS_BASE}/orders?barcode=${barcode}`, {
          headers: { Authorization: `Bearer ${config.token}` },
        });
        if (!res.ok) continue;

        const data: any = await res.json();
        const item = Array.isArray(data) ? data[0] : data?.data?.[0] ?? data?.data ?? data;
        const rawStatus = String(item?.status ?? item?.state ?? '').toLowerCase().replace(/\s/g, '_');
        if (!rawStatus) continue;

        const mapped = STATUS_MAP[rawStatus];
        if (!mapped || mapped === order.orderStatus) continue;

        // Never override PAYE (only set via Excel import)
        if (order.orderStatus === 'PAYE') continue;

        await this.prisma.order.update({
          where: { id: order.id },
          data: { orderStatus: mapped },
        });

        await this.prisma.orderEvent.create({
          data: {
            orderId: order.id,
            eventType: 'status_changed',
            payload: { to: mapped, source: 'cosmos', rawStatus },
            actor: 'system:cosmos',
          },
        });

        updated++;
      } catch {}
    }

    return { ok: true, checked, updated };
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
}