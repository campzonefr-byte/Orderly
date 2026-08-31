"use client";
import {
  AdvancedFilters,
  ActiveFilterChips,
  applyAdvancedFilters,
  EMPTY_FILTERS,
  type AdvancedFilterState,
} from "@/components/stats/advanced-filters";

import {
  PeriodFilter,
  StatCard,
  getPeriodRange,
  isInPeriod,
  type Period,
} from "@/components/stats/period-filter";
import { ProductPicker, StorePicker, useStoreProducts, type StoreProduct } from "@/components/orders/product-picker";
import { useState, useEffect, useCallback } from "react";
import { Sidebar } from "@/components/layout/sidebar";
import { RouteGuard } from "@/components/auth/route-guard";
import { useStores } from "@/lib/stores-context";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { TagBadge } from "@/components/orders/tag-picker";
import {
  Search, ChevronLeft, ChevronRight, Package,
  CheckCircle2, X, Printer, Archive, Plus, Truck,
  Calendar, Phone, MapPin, History,Lock,
} from "lucide-react";
import { Order, OrderStatus } from "@/types/order";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api";

function getToken() {
  return window.localStorage.getItem("orderly_token");
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("fr-FR", {
    day: "numeric", month: "short", year: "numeric",
  });
}

function formatMoney(n: number, currency: string) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency }).format(n);
}

function openBordereau(orderId: string) {
  window.open(`${API}/orders/${orderId}/bordereau`, "_blank");
}

async function apiChangeStatus(orderId: string, status: OrderStatus) {
  await fetch(`${API}/orders/${orderId}/status`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${getToken()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ status }),
  });
}

const PAGE_SIZE = 25;

// Flux: A_PREPARER → (imprimer) → EN_PREPARATION → (scan) → EMBALLE → (scan livreur) → AU_DEPOT_LIVREUR
const PREP_STATUS_KEYS: OrderStatus[] = [
  "A_PREPARER", "ECHANGE", "EN_PREPARATION", "EMBALLE",
];

const DELIVERY_COMPANIES = ["Cosmos", "Aramex", "Tunisie Express", "Autre"];

const STATUS_STYLE: Record<string, string> = {
  A_PREPARER: "bg-status-new-bg text-status-new",
  ECHANGE: "bg-purple-50 text-purple-600",
  EN_PREPARATION: "bg-status-processing-bg text-status-processing",
  EMBALLE: "bg-status-shipped-bg text-status-shipped",
};

const STATUS_LABEL: Record<string, string> = {
  A_PREPARER: "À préparer",
  ECHANGE: "Échange",
  EN_PREPARATION: "En préparation",
  EMBALLE: "Emballé",
};

function CreateOrderModal({
  stores,
  onClose,
  onCreated,
}: {
  stores: { id: string; name: string }[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [storeId, setStoreId] = useState(stores[0]?.id ?? "");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [city, setCity] = useState("");
  const [address, setAddress] = useState("");
  const [deliveryCompany, setDeliveryCompany] = useState("");
  const [products, setProducts] = useState<{ title: string; sku: string; quantity: number; price: number }[]>([
    { title: "", sku: "", quantity: 1, price: 0 },
  ]);
  const [loading, setLoading] = useState(false);

  const { products: storeProducts, loading: loadingProducts } = useStoreProducts(storeId);

  const total = products.reduce((s, p) => s + p.price * p.quantity, 0);

  function updateProduct(idx: number, patch: Partial<typeof products[0]>) {
    setProducts((prev) => prev.map((p, i) => i === idx ? { ...p, ...patch } : p));
  }

  function addProduct() {
    setProducts((prev) => [...prev, { title: "", sku: "", quantity: 1, price: 0 }]);
  }

  function removeProduct(idx: number) {
    setProducts((prev) => prev.filter((_, i) => i !== idx));
  }

  function handleProductSelect(idx: number, product: StoreProduct | null, rawText: string) {
    if (product) {
      updateProduct(idx, {
        title: product.name,
        sku: product.sku,
        price: product.price ?? products[idx].price,
      });
    } else {
      updateProduct(idx, { title: rawText, sku: "" });
    }
  }

  async function create() {
    setLoading(true);
    try {
      await fetch(`${API}/orders/manual`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${getToken()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          storeId,
          customerName: name,
          customerPhone: phone,
          shippingAddress: { city, address1: address },
          currency: "TND",
          subtotal: total,
          total,
          source: "manual",
          orderStatus: "A_PREPARER",
          deliveryCompany,
          lineItems: products.filter((p) => p.title.trim()),
        }),
      });
      onCreated();
      onClose();
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  const canCreate =
    storeId && name.trim() && phone.trim() && deliveryCompany &&
    products.some((p) => p.title.trim());

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30 backdrop-blur-[2px]">
      <div className="w-full max-w-lg rounded-xl border border-border bg-surface shadow-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-sm font-semibold">Créer une commande</h2>
          <button onClick={onClose} className="rounded-md p-1 hover:bg-surface-sunken">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Store */}
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">Magasin</label>
            <StorePicker stores={stores} value={storeId} onChange={(id) => {
              setStoreId(id);
              setProducts([{ title: "", sku: "", quantity: 1, price: 0 }]);
            }} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">Nom client</label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nom complet" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">Téléphone</label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+216 XX XXX XXX" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">Ville</label>
              <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Tunis" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">Adresse</label>
              <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Rue..." />
            </div>
          </div>

          {/* Delivery company */}
          <div>
            <label className="mb-2 block text-xs font-medium text-muted">Société de livraison</label>
            <div className="grid grid-cols-4 gap-2">
              {DELIVERY_COMPANIES.map((c) => (
                <button
                  key={c}
                  onClick={() => setDeliveryCompany(c)}
                  className={cn(
                    "flex items-center justify-center gap-1.5 rounded-lg border-2 px-2 py-2 text-xs font-medium transition-colors",
                    deliveryCompany === c
                      ? "border-primary bg-primary-soft text-primary"
                      : "border-border text-muted hover:border-border-strong hover:text-foreground"
                  )}
                >
                  <Truck className="h-3.5 w-3.5 shrink-0" />
                  {c}
                </button>
              ))}
            </div>
          </div>

          {/* Products */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-muted">
                Produits
                {storeId && (
                  <span className="ml-1 text-[10px] text-muted-light">
                    ({storeProducts.length} disponibles)
                  </span>
                )}
              </label>
              <button onClick={addProduct} className="flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                <Plus className="h-3 w-3" /> Ajouter
              </button>
            </div>

            {!storeId && (
              <p className="rounded-lg bg-surface-sunken px-3 py-2 text-xs text-muted">
                Choisissez un magasin pour voir ses produits
              </p>
            )}

            <div className="space-y-2">
              {products.map((p, idx) => (
                <div key={idx} className="rounded-lg border border-border p-2 space-y-2">
                  <div className="flex items-center gap-2">
                    <ProductPicker
                      value={p.title}
                      onSelect={(prod, raw) => handleProductSelect(idx, prod, raw)}
                      products={storeProducts}
                      loading={loadingProducts}
                      className="flex-1"
                    />
                    {products.length > 1 && (
                      <button onClick={() => removeProduct(idx)} className="text-muted hover:text-status-cancelled">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] text-muted">Quantité</label>
                      <Input
                        type="number"
                        value={p.quantity}
                        onChange={(e) => updateProduct(idx, { quantity: parseInt(e.target.value) || 1 })}
                        min={1}
                        className="h-8 text-xs"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-muted">Prix unitaire</label>
                      <Input
                        type="number"
                        value={p.price}
                        onChange={(e) => updateProduct(idx, { price: parseFloat(e.target.value) || 0 })}
                        min={0}
                        step="0.001"
                        className="h-8 text-xs"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-between items-center rounded-lg bg-surface-sunken px-3 py-2">
            <span className="text-xs font-medium text-muted">Total</span>
            <span className="font-mono text-sm font-bold">{total.toFixed(3)} TND</span>
          </div>
        </div>

        <div className="flex gap-2 border-t border-border px-5 py-4">
          <Button variant="secondary" className="flex-1" onClick={onClose}>Annuler</Button>
          <Button className="flex-1" disabled={loading || !canCreate} onClick={create}>
            <Plus className="h-3.5 w-3.5" />
            {loading ? "Création..." : "Créer la commande"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function ArchiveModal({
  order,
  onClose,
  onConfirm,
}: {
  order: Order;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-foreground/30 backdrop-blur-[2px]">
      <div className="w-full max-w-sm rounded-xl border border-border bg-surface shadow-2xl">
        <div className="flex items-center gap-2.5 border-b border-border px-5 py-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-status-cancelled-bg">
            <Archive className="h-4 w-4 text-status-cancelled" />
          </div>
          <h2 className="text-sm font-semibold">Archiver la commande ?</h2>
        </div>

        <div className="space-y-3 p-5">
          <div className="rounded-lg bg-surface-sunken px-3 py-2.5">
            <p className="font-mono text-sm font-semibold">{order.orderNumber}</p>
            <p className="mt-0.5 text-xs text-muted">
              {order.customerName ?? "—"} · {formatMoney(order.total, order.currency)}
            </p>
          </div>
          <p className="text-xs text-muted leading-relaxed">
            La commande sera déplacée vers les archives. Elle n'est pas supprimée
            et pourra être récupérée à tout moment.
          </p>
        </div>

        <div className="flex gap-2 border-t border-border px-5 py-4">
          <Button variant="secondary" className="flex-1" onClick={onClose}>Annuler</Button>
          <Button variant="destructive" className="flex-1" onClick={onConfirm}>
            <Archive className="h-3.5 w-3.5" />
            Archiver
          </Button>
        </div>
      </div>
    </div>
  );
}
function OrderDetailModal({
  order,
  onClose,
  onChangeStatus,
  onArchive,
}: {
  order: Order;
  onClose: () => void;
  onChangeStatus: (status: OrderStatus) => void;
  onArchive: () => void;
}) {
  const [events, setEvents] = useState<any[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API}/orders/${order.id}/events`, {
          headers: { Authorization: `Bearer ${getToken()}` },
        });
        const data = await res.json();
        setEvents(Array.isArray(data) ? data : []);
      } catch {
        setEvents([]);
      } finally {
        setLoadingEvents(false);
      }
    })();
  }, [order.id]);

  const addr = order.shippingAddress as any;
  const isExchange = order.orderStatus === "ECHANGE" || (order.tags ?? []).includes("Échange");

  // Exchange metadata
  let exchangeMeta: any = null;
  try {
    const parsed = JSON.parse(order.internalNote ?? "{}");
    exchangeMeta = parsed.exchange ?? null;
  } catch {}

  const plainNote = (() => {
    try {
      JSON.parse(order.internalNote ?? "");
      return null;
    } catch {
      return order.internalNote;
    }
  })();

  const scheduledDate = order.scheduledDeliveryDate
    ? new Date(order.scheduledDeliveryDate)
    : null;
  const daysUntil = scheduledDate
    ? Math.ceil((scheduledDate.getTime() - Date.now()) / 86400000)
    : null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-foreground/30 backdrop-blur-[2px]">
      <div className="w-full max-w-3xl rounded-xl border border-border bg-surface shadow-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-border px-5 py-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-mono text-base font-semibold">{order.orderNumber}</h2>
              <span className={cn(
                "rounded px-2 py-0.5 text-xs font-medium",
                STATUS_STYLE[order.orderStatus] ?? "bg-surface-sunken text-muted"
              )}>
                {STATUS_LABEL[order.orderStatus] ?? order.orderStatus}
              </span>
              {isExchange && (
                <span className="rounded bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-700">
                  Échange
                </span>
              )}
            </div>
            <p className="mt-0.5 text-xs text-muted">
              {order.storeName} · Créée le {formatDate(order.sourceCreatedAt)}
            </p>
          </div>
          <button onClick={onClose} className="rounded-md p-1 hover:bg-surface-sunken">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">

          {/* Scheduled date — highly visible */}
          {scheduledDate && (
            <div className="flex items-center gap-3 rounded-xl border-2 border-primary bg-primary-soft px-4 py-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary text-white">
                <Calendar className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-primary">
                  Livraison programmée
                </p>
                <p className="text-sm font-semibold text-primary">
                  {scheduledDate.toLocaleDateString("fr-FR", {
                    weekday: "long", day: "numeric", month: "long", year: "numeric",
                  })}
                </p>
                <p className="text-[11px] text-primary/70">
                  {daysUntil === 0 ? "Aujourd'hui" :
                   daysUntil === 1 ? "Demain" :
                   daysUntil && daysUntil > 0 ? `Dans ${daysUntil} jours` :
                   "Date dépassée"}
                </p>
              </div>
            </div>
          )}

          {/* Exchange info */}
          {exchangeMeta && (
            <div className="rounded-xl border-2 border-purple-300 bg-purple-50 px-4 py-3">
              <p className="text-xs font-bold uppercase tracking-wide text-purple-700 mb-2">
                Produits à récupérer chez le client
              </p>
              <div className="space-y-1">
                {exchangeMeta.itemsToRecover?.map((it: any, i: number) => (
                  <p key={i} className="text-sm font-medium text-purple-900">
                    {it.title}{it.variantTitle ? ` — ${it.variantTitle}` : ""} × {it.quantity}
                  </p>
                ))}
              </div>
              <p className="mt-2 text-[11px] text-purple-700">
                Commande d'origine : {exchangeMeta.originalOrderNumber} · Raison : {exchangeMeta.reason}
              </p>
            </div>
          )}

          {/* Tags */}
          {(order.tags ?? []).length > 0 && (
            <div>
              <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted">Tags</p>
              <div className="flex flex-wrap gap-1.5">
                {(order.tags ?? []).map((t) => (
                  <TagBadge key={t} tag={t} />
                ))}
              </div>
            </div>
          )}

          {/* Two columns */}
          <div className="grid grid-cols-2 gap-4">
            {/* Client */}
            <div className="rounded-lg border border-border p-3.5 space-y-2">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted">Client</p>
              <p className="text-sm font-semibold">{order.customerName ?? "—"}</p>
              <div className="space-y-1 text-xs">
                <p className="flex items-center gap-1.5 font-mono text-muted">
                  <Phone className="h-3 w-3" /> {order.customerPhone ?? "—"}
                </p>
                {order.customerPhone2 && (
                  <p className="flex items-center gap-1.5 font-mono text-muted">
                    <Phone className="h-3 w-3" /> {order.customerPhone2}
                  </p>
                )}
                {addr && (
                  <p className="flex items-start gap-1.5 text-muted">
                    <MapPin className="mt-0.5 h-3 w-3 shrink-0" />
                    <span>
                      {addr.address1 ?? ""}{addr.address1 && addr.city ? ", " : ""}{addr.city ?? ""}
                      {addr.province ? ` (${addr.province})` : ""}
                    </span>
                  </p>
                )}
              </div>
            </div>

            {/* Delivery */}
            <div className="rounded-lg border border-border p-3.5 space-y-2">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted">Livraison</p>
              <p className="flex items-center gap-1.5 text-sm font-semibold">
                <Truck className="h-3.5 w-3.5 text-muted" />
                {order.deliveryCompany ?? "Non défini"}
              </p>
              {order.trackingNumber && (
                <p className="font-mono text-xs text-muted">
                  Tracking : {order.trackingNumber}
                </p>
              )}
              <div className="pt-1">
                <p className="text-[11px] text-muted">Montant à encaisser</p>
                <p className="font-mono text-lg font-bold text-status-delivered">
                  {formatMoney(order.total, order.currency)}
                </p>
              </div>
            </div>
          </div>

          {/* Products */}
          <div className="rounded-lg border border-border">
            <div className="border-b border-border px-3.5 py-2.5">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted">
                Articles ({order.lineItems?.length ?? 0})
              </p>
            </div>
            <div className="divide-y divide-border">
              {order.lineItems?.map((li) => (
                <div key={li.id} className="flex items-center gap-3 px-3.5 py-2.5">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-surface-sunken">
                    <Package className="h-3.5 w-3.5 text-muted-light" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">
                      {li.title}
                      {li.variantTitle && (
                        <span className="ml-1 text-xs text-muted">— {li.variantTitle}</span>
                      )}
                    </p>
                    <p className="font-mono text-[11px] text-muted">
                    {li.sku || "sans SKU"} · Qté {li.quantity} · unitaire
                    </p>
                  </div>
                  <p className="shrink-0 font-mono text-sm font-medium">
                    {formatMoney(Number(li.price) * li.quantity, order.currency)}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Note */}
          {plainNote && (
            <div className="rounded-lg border border-border p-3.5">
              <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted">Note interne</p>
              <p className="text-xs">{plainNote}</p>
            </div>
          )}

          {/* History */}
          <div className="rounded-lg border border-border">
            <div className="border-b border-border px-3.5 py-2.5">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted flex items-center gap-1.5">
                <History className="h-3 w-3" />
                Historique
              </p>
            </div>
            <div className="max-h-40 overflow-y-auto p-3.5">
              {loadingEvents ? (
                <p className="text-xs text-muted">Chargement...</p>
              ) : events.length === 0 ? (
                <p className="text-xs text-muted">Aucun événement</p>
              ) : (
                <div className="space-y-2">
                  {events.map((e) => (
                    <div key={e.id} className="flex items-start gap-2">
                      <div className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-border-strong" />
                      <div className="min-w-0 flex-1">
                        <p className="text-[11px] font-medium">
                          {e.eventType === "status_changed"
                            ? `Statut → ${STATUS_LABEL[e.payload?.to] ?? e.payload?.to ?? ""}`
                            : e.eventType === "order_edited"
                            ? "Commande modifiée"
                            : e.eventType === "order_created_manual"
                            ? "Créée manuellement"
                            : e.eventType === "exchange_created"
                            ? "Échange créé"
                            : e.eventType}
                        </p>
                        <p className="text-[10px] text-muted-light">
                          {e.actorName} · {new Date(e.createdAt).toLocaleString("fr-FR")}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2 border-t border-border px-5 py-4">
          <Button variant="secondary" onClick={onClose}>Fermer</Button>
          <Button variant="outline" onClick={() => openBordereau(order.id)}>
            <Printer className="h-3.5 w-3.5" />
            Bordereau
          </Button>
          <div className="flex-1" />
          {(order.orderStatus === "A_PREPARER" || order.orderStatus === "ECHANGE") && (
            <Button onClick={() => { onChangeStatus("EN_PREPARATION"); onClose(); }}>
              <Printer className="h-3.5 w-3.5" />
              Imprimer
            </Button>
          )}
          {(order.orderStatus === "EN_PREPARATION" || order.orderStatus === "EMBALLE") && (
            <span className="flex items-center gap-1.5 self-center text-xs text-muted">
              <Lock className="h-3.5 w-3.5" />
              {order.orderStatus === "EN_PREPARATION"
                ? "En attente du scan d'emballage"
                : "Prêt pour ramassage"}
            </span>
          )}
          <Button variant="destructive" onClick={() => { onArchive(); onClose(); }}>
            <Archive className="h-3.5 w-3.5" />
            Archiver
          </Button>
        </div>
      </div>
    </div>
  );
}
function PreparationContent() {

  const [detailOrder, setDetailOrder] = useState<Order | null>(null);
  const { canAccessStore } = useAuth();
  const { stores } = useStores();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedStoreIds, setSelectedStoreIds] = useState<string[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState<"all" | OrderStatus>("all");
  const [showCreate, setShowCreate] = useState(false);
  const [archiveOrder, setArchiveOrder] = useState<Order | null>(null);
  const [printing, setPrinting] = useState<string | null>(null);
  const [period, setPeriod] = useState<Period>(getPeriodRange("all"));
  const [advFilters, setAdvFilters] = useState<AdvancedFilterState>(EMPTY_FILTERS);

  const accessibleStores = stores.filter((s) => canAccessStore(s.id));
  const activeStore = accessibleStores[0];

  useEffect(() => {
    if (stores.length > 0 && selectedStoreIds.length === 0) {
      setSelectedStoreIds(stores.map((s) => s.id));
    }
  }, [stores]);

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      const token = getToken();
      const res = await fetch(`${API}/orders?pageSize=200`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      const all: Order[] = data.orders ?? [];
      setOrders(all.filter((o) => PREP_STATUS_KEYS.includes(o.orderStatus)));
    } catch {
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  async function changeStatus(orderId: string, status: OrderStatus) {
    if (PREP_STATUS_KEYS.includes(status)) {
      setOrders((prev) =>
        prev.map((o) => o.id === orderId ? { ...o, orderStatus: status } : o)
      );
    } else {
      setOrders((prev) => prev.filter((o) => o.id !== orderId));
    }
    await apiChangeStatus(orderId, status);
  }

  // Imprimer → EN_PREPARATION
  async function handlePrint(order: Order) {
    setPrinting(order.id);
    try {
      const res = await fetch(`${API}/orders/${order.id}/prepare-print`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${getToken()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      });
      const data = await res.json();

      if (data.source === "cosmos" && data.labelUrl) {
        window.open(data.labelUrl, "_blank");
      } else {
        if (data.cosmosError) {
          alert(
            `Colis Cosmos non cree : ${data.cosmosError}\n\n` +
            `Le bordereau Orderly est utilise a la place.` +
            (data.acceptedCities
              ? `\n\nVilles acceptees : ${data.acceptedCities.join(", ")}`
              : "")
          );
        }
        openBordereau(order.id);
      }

      fetchOrders();
    } catch {
      openBordereau(order.id);
    } finally {
      setPrinting(null);
    }
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    const pageIds = pageOrders.map((o) => o.id);
    const allSelected = pageIds.every((id) => selectedIds.has(id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allSelected) pageIds.forEach((id) => next.delete(id));
      else pageIds.forEach((id) => next.add(id));
      return next;
    });
  }

  async function printBulk() {
    const ids = Array.from(selectedIds);
    setPrinting("bulk");
    const cosmosBarcodes: string[] = [];
    const fallback: string[] = [];

    for (const id of ids) {
      const order = orders.find((o) => o.id === id);
      if (!order) continue;
      if (!["A_PREPARER", "ECHANGE"].includes(order.orderStatus)) continue;

      try {
        const res = await fetch(`${API}/orders/${id}/prepare-print`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${getToken()}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({}),
        });
        const data = await res.json();
        if (data.source === "cosmos" && data.barcode) {
          cosmosBarcodes.push(data.barcode);
        } else {
          fallback.push(id);
        }
      } catch {
        fallback.push(id);
      }
    }

    // Cosmos: one PDF with all labels
    if (cosmosBarcodes.length > 0) {
      const storeId = orders.find((o) => ids.includes(o.id))?.storeId;
      window.open(
        `${API}/delivery/cosmos/${storeId}/label?barcode=${cosmosBarcodes.join(",")}&format=pdf`,
        "_blank"
      );
    }

    // Others: one tab each
    fallback.forEach((id, i) => {
      setTimeout(() => openBordereau(id), i * 300);
    });

    if (fallback.length > 0 && cosmosBarcodes.length > 0) {
      alert(
        `${cosmosBarcodes.length} bordereaux Cosmos generes.\n` +
        `${fallback.length} bordereaux Orderly (Cosmos indisponible).`
      );
    }

    setPrinting(null);
    setSelectedIds(new Set());
    fetchOrders();
  }

  const filtered = orders.filter((o) => {
    if (!selectedStoreIds.includes(o.storeId)) return false;
    if (!isInPeriod(o.sourceCreatedAt, period)) return false;
    if (!applyAdvancedFilters(o, advFilters)) return false;
    if (filter !== "all" && o.orderStatus !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      const hay = `${o.orderNumber} ${o.customerName ?? ""} ${o.customerPhone ?? ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageOrders = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Orders matching stats filters
  const statsOrders = orders.filter((o) => {
    if (!selectedStoreIds.includes(o.storeId)) return false;
    if (!isInPeriod(o.sourceCreatedAt, period)) return false;
    if (!applyAdvancedFilters(o, advFilters)) return false;
    return true;
  });

  const counts: Record<string, number> = {};
  statsOrders.forEach((o) => {
    counts[o.orderStatus] = (counts[o.orderStatus] ?? 0) + 1;
  });

  const statsTotal = statsOrders.length;
  const aPreparerCount = (counts["A_PREPARER"] ?? 0) + (counts["ECHANGE"] ?? 0);
  const enCoursCount = counts["EN_PREPARATION"] ?? 0;
  const emballeCount = counts["EMBALLE"] ?? 0;
  const traiteesCount = enCoursCount + emballeCount;

  const totalValue = statsOrders.reduce((s, o) => s + Number(o.total), 0);
  const emballeValue = statsOrders
    .filter((o) => o.orderStatus === "EMBALLE")
    .reduce((s, o) => s + Number(o.total), 0);

  

  return (
    <div className="flex h-screen bg-background">
      <Sidebar
        stores={accessibleStores}
        selectedStoreIds={selectedStoreIds}
        onChangeSelectedStores={setSelectedStoreIds}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-surface px-5">
          <h1 className="text-base font-semibold">Préparation</h1>
          <div className="flex items-center gap-2">
            {selectedIds.size > 0 && (
             <Button
             size="sm"
             variant="secondary"
             disabled={printing === "bulk"}
             onClick={printBulk}
           >
             <Printer className="h-3.5 w-3.5" />
             {printing === "bulk"
               ? "Creation..."
               : `Imprimer ${selectedIds.size} bordereau${selectedIds.size > 1 ? "x" : ""}`}
           </Button>
            )}
            <Button size="sm" onClick={() => setShowCreate(true)}>
              <Plus className="h-3.5 w-3.5" />
              Créer commande
            </Button>
            <p className="text-xs text-muted">{orders.length} commandes</p>
          </div>
        </header>

       {/* Period filter */}
       <div className="border-b border-border bg-surface px-5 py-3">
          <PeriodFilter period={period} onChange={setPeriod} />
        </div>
        {/* Stats */}
        <div className="grid grid-cols-6 gap-3 border-b border-border bg-surface p-4">
          <StatCard label="Total reçues" value={statsTotal} color="gray" />
          <StatCard label="À préparer" value={aPreparerCount} total={statsTotal} color="blue" />
          <StatCard label="En préparation" value={enCoursCount} total={statsTotal} color="orange" />
          <StatCard label="Emballées" value={emballeCount} total={statsTotal} color="green" />
          <StatCard label="Traitées" value={traiteesCount} total={statsTotal} color="purple" />
          <div className="rounded-lg bg-primary-soft px-4 py-3">
            <p className="text-[11px] font-medium text-primary">Valeur emballée</p>
            <p className="mt-1 text-2xl font-bold text-primary font-mono">
              {emballeValue.toLocaleString("fr-FR", { maximumFractionDigits: 0 })}
            </p>
            <p className="mt-1 text-[10px] text-primary/70">
              sur {totalValue.toLocaleString("fr-FR", { maximumFractionDigits: 0 })} TND
            </p>
          </div>
        </div>

       {/* Filters */}
       <div className="border-b border-border bg-surface px-5 py-3 space-y-2">
       <div className="flex items-center gap-3">
          <div className="relative w-64 shrink-0">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-light" />
            <Input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="Rechercher..."
              className="pl-8"
              />
              </div>
              <AdvancedFilters filters={advFilters} onChange={setAdvFilters} orders={orders} />
              <div className="flex gap-1">
                {[
                  { key: "all", label: "Tous", count: orders.length },
                  { key: "A_PREPARER", label: "À préparer", count: counts["A_PREPARER"] ?? 0 },
              { key: "ECHANGE", label: "Échanges", count: counts["ECHANGE"] ?? 0 },
              { key: "EN_PREPARATION", label: "En préparation", count: counts["EN_PREPARATION"] ?? 0 },
              { key: "EMBALLE", label: "Emballés", count: counts["EMBALLE"] ?? 0 },
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => { setFilter(tab.key as any); setPage(1); }}
                className={cn(
                  "flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                  filter === tab.key ? "bg-primary-soft text-primary" : "text-muted hover:bg-surface-sunken"
                )}
              >
                {tab.label}
                <span className={cn(
                  "rounded-full px-1.5 py-0.5 text-[10px]",
                  filter === tab.key ? "bg-primary text-white" : "bg-surface-sunken"
                )}>
                 {tab.count}
                </span>
              </button>
            ))}
          </div>
          </div>
          <ActiveFilterChips filters={advFilters} onChange={setAdvFilters} />
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto">
          {loading ? (
            <div className="flex items-center justify-center py-24">
              <p className="text-sm text-muted">Chargement...</p>
            </div>
          ) : (
            <table className="w-full border-collapse text-sm">
              <thead className="sticky top-0 z-10 bg-surface">
                <tr className="border-b border-border text-left text-xs font-medium text-muted">
                  <th className="w-10 px-4 py-2.5">
                    <input
                      type="checkbox"
                      checked={pageOrders.length > 0 && pageOrders.every((o) => selectedIds.has(o.id))}
                      onChange={toggleSelectAll}
                      className="h-3.5 w-3.5 rounded border-border-strong accent-primary"
                    />
                  </th>
                  <th className="px-4 py-2.5">Commande</th>
                  <th className="px-4 py-2.5">Date</th>
                  <th className="px-4 py-2.5">Client</th>
                  <th className="px-4 py-2.5">Téléphone</th>
                  <th className="px-4 py-2.5">Articles</th>
                  <th className="px-4 py-2.5">Montant</th>
                  <th className="px-4 py-2.5">Livreur</th>
                  <th className="px-4 py-2.5">Agent</th>
                  <th className="px-4 py-2.5">Statut</th>
                  <th className="px-4 py-2.5">Actions</th>
                </tr>
              </thead>
              <tbody>
                {pageOrders.map((order) => (
                 <tr
                 key={order.id}
                 onClick={() => setDetailOrder(order)}
                 className={cn(
                   "cursor-pointer border-b border-border transition-colors hover:bg-surface-sunken",
                   selectedIds.has(order.id) && "bg-primary-soft/30",
                   order.orderStatus === "ECHANGE" && "bg-purple-50/30"
                 )}
               >
                   <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selectedIds.has(order.id)}
                        onChange={() => toggleSelect(order.id)}
                        className="h-3.5 w-3.5 rounded border-border-strong accent-primary"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-mono text-[13px] font-semibold">{order.orderNumber}</span>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted whitespace-nowrap">
                      {formatDate(order.sourceCreatedAt)}
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium truncate max-w-[130px]">{order.customerName ?? "—"}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs">{order.customerPhone ?? "—"}</span>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted">
                      {order.lineItems?.map((li) => (
                        <div key={li.id} className="truncate max-w-[180px]">
                          {li.title} × {li.quantity}
                        </div>
                      ))}
                    </td>
                    <td className="px-4 py-3 font-mono text-sm font-medium">
                      {formatMoney(order.total, order.currency)}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted">
                      {order.deliveryCompany ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      {order.assignedAgentName ? (
                        <div className="flex items-center gap-1.5">
                          <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-white">
                            {order.assignedAgentName[0]?.toUpperCase()}
                          </div>
                          <span className="text-xs truncate max-w-[80px]">{order.assignedAgentName}</span>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-light">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn(
                        "rounded px-2 py-1 text-xs font-medium whitespace-nowrap",
                        STATUS_STYLE[order.orderStatus] ?? "bg-surface-sunken text-muted"
                      )}>
                        {STATUS_LABEL[order.orderStatus] ?? order.orderStatus}
                      </span>
                    </td>
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-1.5">
                        {/* À PRÉPARER / ÉCHANGE → Imprimer → EN_PREPARATION */}
                        {(order.orderStatus === "A_PREPARER" || order.orderStatus === "ECHANGE") && (
                          <Button
                            size="sm"
                            disabled={printing === order.id}
                            onClick={() => handlePrint(order)}
                          >
                            <Printer className="h-3.5 w-3.5" />
                            {printing === order.id ? "Creation..." : "Imprimer"}
                          </Button>
                        )}

                        {/* EN PRÉPARATION → attend scan, ou forcer Emballé */}
                        {order.orderStatus === "EN_PREPARATION" && (
                          <>
                            <Button
                              size="sm"
                              variant="secondary"
                              disabled={printing === order.id}
                              onClick={() => handlePrint(order)}
                            >
                              <Printer className="h-3.5 w-3.5" />
                              Réimprimer
                            </Button>
                            <span className="text-[11px] text-muted">
                              en attente du scan
                            </span>
                          </>
                        )}

                        {/* EMBALLÉ → au dépôt livreur */}
                        {order.orderStatus === "EMBALLE" && (
                          <>
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={printing === order.id}
                              onClick={() => handlePrint(order)}
                            >
                              <Printer className="h-3.5 w-3.5" />
                            </Button>
                            <span className="flex items-center gap-1 text-[11px] text-status-shipped">
                              <CheckCircle2 className="h-3 w-3" />
                              prêt pour ramassage
                            </span>
                          </>
                        )}

                        <button
                          onClick={() => setArchiveOrder(order)}
                          className="rounded-md p-1.5 text-muted hover:bg-status-cancelled-bg hover:text-status-cancelled"
                          title="Archiver"
                        >
                          <Archive className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {!loading && pageOrders.length === 0 && (
            <div className="flex flex-col items-center justify-center py-24">
              <Package className="h-8 w-8 text-muted-light" />
              <p className="mt-2 text-sm font-medium">Aucune commande à préparer</p>
              <p className="mt-1 text-xs text-muted">Les commandes confirmées apparaîtront ici.</p>
            </div>
          )}
        </div>

        <footer className="flex shrink-0 items-center justify-between border-t border-border bg-surface px-5 py-2.5">
          <p className="text-xs text-muted">
            {filtered.length} commandes
            {selectedIds.size > 0 && ` · ${selectedIds.size} sélectionnée${selectedIds.size > 1 ? "s" : ""}`}
          </p>
          <div className="flex items-center gap-1">
            <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <span className="px-2 text-xs text-muted">Page {page} / {totalPages}</span>
            <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </footer>
      </div>

      {archiveOrder && (
        <ArchiveModal
          order={archiveOrder}
          onClose={() => setArchiveOrder(null)}
          onConfirm={() => {
            changeStatus(archiveOrder.id, "ARCHIVE");
            setArchiveOrder(null);
          }}
        />
      )}
{detailOrder && (
        <OrderDetailModal
          order={detailOrder}
          onClose={() => setDetailOrder(null)}
          onChangeStatus={(status) => changeStatus(detailOrder.id, status)}
          onArchive={() => setArchiveOrder(detailOrder)}
        />
      )}
{showCreate && (
        <CreateOrderModal
          stores={accessibleStores}
          onClose={() => setShowCreate(false)}
          onCreated={fetchOrders}
        />
      )}
    </div>
  );
}

export default function PreparationPage() {
  return (
    <RouteGuard>
      <PreparationContent />
    </RouteGuard>
  );
}