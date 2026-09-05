"use client";
import {
  AdvancedFilters,
  ActiveFilterChips,
  applyAdvancedFilters,
  EMPTY_FILTERS,
  type AdvancedFilterState,
} from "@/components/stats/advanced-filters";
import { CustomerBadges, normalizePhone, type CustomerStats } from "@/components/orders/customer-badges";
import {
  PeriodFilter,
  StatCard,
  getPeriodRange,
  isInPeriod,
  type Period,
} from "@/components/stats/period-filter";
import { ProductPicker, StorePicker, useStoreProducts, type StoreProduct } from "@/components/orders/product-picker";
import { MentionInput, MentionText, processMentions } from "@/components/ui/mention-input";
import { useState, useEffect, useCallback } from "react";
import { Sidebar } from "@/components/layout/sidebar";
import { RouteGuard } from "@/components/auth/route-guard";
import { useStores } from "@/lib/stores-context";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  Phone, Search, X, ChevronLeft, ChevronRight,CheckCircle2, PhoneMissed, Clock, PhoneOff,
  Plus, Trash2, Edit2, Check, Building2, Calendar, Archive, Truck,Sparkles,ArrowRightLeft,Lock, AlertTriangle,Package,
} from "lucide-react";
import { Order, OrderStatus, CallAttempt } from "@/types/order";
import { OrderStatusBadge } from "@/components/orders/status-badge";
import { TagBadge, TagPicker } from "@/components/orders/tag-picker";
import { CityPicker, isValidCity, detectCity } from "@/components/orders/city-picker";

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

const CALL_RESULTS = [
  { value: "ANSWERED_CONFIRMED", label: "Confirmé", bg: "bg-emerald-500", text: "text-white", border: "border-emerald-600", light: "bg-emerald-50 text-emerald-700 border-emerald-300" },
  { value: "ANSWERED_REFUSED", label: "Refusé", bg: "bg-red-500", text: "text-white", border: "border-red-600", light: "bg-red-50 text-red-700 border-red-300" },
  { value: "NO_ANSWER", label: "Pas de réponse", bg: "bg-slate-500", text: "text-white", border: "border-slate-600", light: "bg-slate-100 text-slate-600 border-slate-300" },
  { value: "BUSY", label: "Occupé", bg: "bg-amber-400", text: "text-white", border: "border-amber-500", light: "bg-amber-50 text-amber-700 border-amber-300" },
  { value: "WRONG_NUMBER", label: "Mauvais numéro", bg: "bg-purple-400", text: "text-white", border: "border-purple-500", light: "bg-purple-50 text-purple-700 border-purple-300" },
];

const RESULT_COLORS: Record<string, string> = {
  ANSWERED_CONFIRMED: "text-status-delivered",
  ANSWERED_REFUSED: "text-status-cancelled",
  NO_ANSWER: "text-status-processing",
  BUSY: "text-status-processing",
  WRONG_NUMBER: "text-status-cancelled",
};

const RESULT_LABELS: Record<string, string> = {
  ANSWERED_CONFIRMED: "Confirmé",
  ANSWERED_REFUSED: "Refusé",
  NO_ANSWER: "Pas de réponse",
  BUSY: "Occupé",
  WRONG_NUMBER: "Mauvais numéro",
};

const DELIVERY_COMPANIES = ["Cosmos", "Aramex", "Tunisie Express", "Autre"];

const CANCELLATION_REASONS = [
  "Client injoignable",
  "Client a refusé",
  "Mauvaise adresse",
  "Commande en double",
  "Rupture de stock",
  "Problème de prix",
  "Changement d'avis",
  "Autre",
];

function CallStatusBadge({ attempts }: { attempts: CallAttempt[] }) {
  const confirmed = attempts.find((a) => a.result === "ANSWERED_CONFIRMED");
  const refused = attempts.find((a) => a.result === "ANSWERED_REFUSED");

  if (confirmed) return (
    <span className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium bg-status-delivered-bg text-status-delivered">
      ✓ Confirmé
    </span>
  );
  if (refused) return (
    <span className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium bg-status-cancelled-bg text-status-cancelled">
      ✗ Refusé
    </span>
  );
  if (attempts.length > 0) return (
    <span className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium bg-status-processing-bg text-status-processing">
      <Phone className="h-3 w-3" />
      Tentative {attempts.length}
    </span>
  );
  return <span className="text-xs text-muted-light">—</span>;
}

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
  const [phone2, setPhone2] = useState("");
  const [city, setCity] = useState("");
  const [address, setAddress] = useState("");
  const [isExchange, setIsExchange] = useState(false);
  const [products, setProducts] = useState<{ title: string; sku: string; quantity: number; price: number }[]>([
    { title: "", sku: "", quantity: 1, price: 0 },
  ]);
  const [loading, setLoading] = useState(false);
  const [cityError, setCityError] = useState(false);
  const [upsellPrices, setUpsellPrices] = useState<Record<string, any>>({});
  const [shippingCost, setShippingCost] = useState(0);
  const [shippingFree, setShippingFree] = useState(false);

  const { products: storeProducts, loading: loadingProducts } = useStoreProducts(storeId);

  // Apply upsells and quantity offers
  useEffect(() => {
    if (isExchange) {
      setUpsellPrices({});
      return;
    }
    (async () => {
      const skus = products.map((p) => p.sku).filter(Boolean);
      if (skus.length < 2) {
        setUpsellPrices({});
        return;
      }
      try {
        const res = await fetch(`${API}/upsells/compute/${storeId}`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${getToken()}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ skus }),
        });
        const data = await res.json();
        setUpsellPrices(data.prices ?? {});
      } catch {
        setUpsellPrices({});
      }
    })();
  }, [products, storeId, isExchange]);

  const productsTotal = isExchange
    ? 0
    : products.reduce((s, p) => {
        const unit = p.sku && upsellPrices[p.sku] ? upsellPrices[p.sku].price : p.price;
        return s + unit * p.quantity;
      }, 0);

  // Shipping from store rules
  useEffect(() => {
    if (isExchange || productsTotal <= 0) {
      setShippingCost(0);
      setShippingFree(false);
      return;
    }
    (async () => {
      try {
        const res = await fetch(
          `${API}/shipping/calculate/${storeId}?subtotal=${productsTotal}&city=${encodeURIComponent(city)}`,
          { headers: { Authorization: `Bearer ${getToken()}` } }
        );
        const data = await res.json();
        setShippingCost(data.cost ?? 0);
        setShippingFree(data.isFree ?? false);
      } catch {
        setShippingCost(0);
      }
    })();
  }, [productsTotal, city, storeId, isExchange]);

  const total = isExchange ? 0 : productsTotal + shippingCost;

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
        price: isExchange ? 0 : (product.price ?? products[idx].price),
      });
    } else {
      updateProduct(idx, { title: rawText, sku: "" });
    }
  }

  async function create() {
    if (!isValidCity(city)) {
      setCityError(true);
      return;
    }
    setCityError(false);
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
          customerPhone2: phone2 || null,
          shippingAddress: { city, address1: address },
          currency: "TND",
          subtotal: total,
          total,
          source: "manual",
          orderStatus: isExchange ? "ECHANGE" : "NOUVEAU",
          tags: isExchange ? ["Échange"] : [],
          lineItems: products
            .filter((p) => p.title.trim())
            .map((p) => ({ ...p, price: isExchange ? 0 : p.price })),
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

  const canCreate = storeId && name.trim() && phone.trim() && products.some((p) => p.title.trim());

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-foreground/30 backdrop-blur-[2px]">
      <div className="w-full max-w-lg rounded-xl border border-border bg-surface shadow-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold">Créer une commande</h2>
            <p className="text-xs text-muted">
              {isExchange ? "Échange — prix à 0" : "À confirmer par téléphone"}
            </p>
          </div>
          <button onClick={onClose} className="rounded-md p-1 hover:bg-surface-sunken">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Exchange toggle */}
          <label
            className={cn(
              "flex cursor-pointer items-center gap-3 rounded-lg border-2 px-3 py-2.5 transition-colors",
              isExchange ? "border-purple-400 bg-purple-50" : "border-border hover:border-border-strong"
            )}
          >
            <input
              type="checkbox"
              checked={isExchange}
              onChange={(e) => {
                setIsExchange(e.target.checked);
                if (e.target.checked) {
                  setProducts((prev) => prev.map((p) => ({ ...p, price: 0 })));
                }
              }}
              className="h-4 w-4 accent-purple-600"
            />
            <div className="flex items-center gap-2">
              <ArrowRightLeft className={cn("h-4 w-4", isExchange ? "text-purple-600" : "text-muted")} />
              <div>
                <p className={cn("text-xs font-medium", isExchange && "text-purple-700")}>
                  C'est un échange
                </p>
                <p className="text-[11px] text-muted">
                  Prix à 0, la commande part directement en préparation
                </p>
              </div>
            </div>
          </label>

          {/* Store */}
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">Magasin</label>
            <StorePicker
              stores={stores}
              value={storeId}
              onChange={(id) => {
                setStoreId(id);
                setProducts([{ title: "", sku: "", quantity: 1, price: 0 }]);
              }}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="mb-1 block text-xs font-medium text-muted">Nom client</label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nom complet" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">Téléphone 1</label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+216 XX XXX XXX" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">Téléphone 2</label>
              <Input value={phone2} onChange={(e) => setPhone2(e.target.value)} placeholder="Optionnel" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">Ville</label>
              <CityPicker value={city} onChange={setCity} address={address} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">Adresse</label>
              <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Rue..." />
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
                        value={isExchange ? 0 : p.price}
                        onChange={(e) => updateProduct(idx, { price: parseFloat(e.target.value) || 0 })}
                        min={0}
                        step="0.001"
                        disabled={isExchange}
                        className="h-8 text-xs disabled:opacity-50"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        
          <div className={cn(
            "flex justify-between items-center rounded-lg px-3 py-2",
            isExchange ? "bg-purple-50" : "bg-surface-sunken"
          )}>
            <span className={cn("text-xs font-medium", isExchange ? "text-purple-700" : "text-muted")}>
              {isExchange ? "Total (échange)" : "Total"}
            </span>
            <span className={cn("font-mono text-sm font-bold", isExchange && "text-purple-700")}>
              {total.toFixed(3)} TND
            </span>
          </div>
          </div>

{cityError && (
  <div className="flex items-start gap-2.5 border-t border-status-cancelled/30 bg-status-cancelled-bg px-5 py-3">
    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-status-cancelled" />
    <div className="text-xs text-status-cancelled">
      <p className="font-semibold">Gouvernorat obligatoire</p>
      <p className="mt-0.5">
        Sélectionnez un gouvernorat dans la liste pour créer la commande.
      </p>
    </div>
  </div>
)}

<div className="flex gap-2 border-t border-border px-5 py-4">
  <Button variant="secondary" className="flex-1" onClick={onClose}>Annuler</Button>
          <Button
            className={cn("flex-1", isExchange && "bg-purple-600 hover:bg-purple-700")}
            disabled={loading || !canCreate}
            onClick={create}
          >
            {isExchange ? <ArrowRightLeft className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
            {loading ? "Création..." : isExchange ? "Créer l'échange" : "Créer la commande"}
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
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-foreground/30 backdrop-blur-[2px]">
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

function CancellationModal({
  onConfirm,
  onClose,
}: {
  onConfirm: (reason: string, note: string) => void;
  onClose: () => void;
}) {
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-foreground/30 backdrop-blur-[2px]">
      <div className="w-full max-w-md rounded-xl border border-border bg-surface shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-sm font-semibold">Raison d'annulation</h2>
          <button onClick={onClose} className="rounded-md p-1 hover:bg-surface-sunken">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-3 p-5">
          <div className="grid grid-cols-2 gap-2">
            {CANCELLATION_REASONS.map((r) => (
              <button
                key={r}
                onClick={() => setReason(r)}
                className={cn(
                  "rounded-md border px-3 py-2 text-left text-xs font-medium transition-colors",
                  reason === r
                    ? "border-status-cancelled bg-status-cancelled-bg text-status-cancelled"
                    : "border-border text-muted hover:border-border-strong hover:text-foreground"
                )}
              >
                {r}
              </button>
            ))}
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted">Note (optionnel)</label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Détails..." />
          </div>
        </div>
        <div className="flex gap-2 border-t border-border px-5 py-4">
          <Button variant="secondary" className="flex-1" onClick={onClose}>Retour</Button>
          <Button variant="destructive" className="flex-1" disabled={!reason} onClick={() => onConfirm(reason, note)}>
            Confirmer l'annulation
          </Button>
        </div>
      </div>
    </div>
  );
}

function DeliveryModal({
  onConfirm,
  onClose,
  storeId,
}: {
  onConfirm: (company: string, date?: string) => void;
  onClose: () => void;
  storeId: string;
}) {
  const [company, setCompany] = useState("");
  const [date, setDate] = useState("");
  const [isScheduled, setIsScheduled] = useState(false);
  const [carriers, setCarriers] = useState<string[]>([]);
  const [loadingCarriers, setLoadingCarriers] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API}/delivery/integrations`, {
          headers: { Authorization: `Bearer ${getToken()}` },
        });
        const data = await res.json();
        const linked = (Array.isArray(data) ? data : [])
          .filter((i: any) =>
            (i.stores ?? []).some((s: any) => s.storeId === storeId)
          )
          .map((i: any) => i.name);

        setCarriers(linked.length > 0 ? linked : ["Cosmos"]);
      } catch {
        setCarriers(["Cosmos"]);
      } finally {
        setLoadingCarriers(false);
      }
    })();
  }, [storeId]);

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-foreground/30 backdrop-blur-[2px]">
      <div className="w-full max-w-md rounded-xl border border-border bg-surface shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-sm font-semibold">Choisir le livreur</h2>
          <button onClick={onClose} className="rounded-md p-1 hover:bg-surface-sunken">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-4 p-5">
          <div>
            <label className="mb-2 block text-xs font-medium text-muted">Société de livraison</label>
            <div className="grid grid-cols-2 gap-2">
              {carriers.map((c) => (
                <button
                  key={c}
                  onClick={() => setCompany(c)}
                  className={cn(
                    "flex items-center gap-2 rounded-lg border-2 px-3 py-2.5 text-xs font-medium transition-colors",
                    company === c
                      ? "border-primary bg-primary-soft text-primary"
                      : "border-border text-muted hover:border-border-strong hover:text-foreground"
                  )}
                >
                  <Building2 className="h-3.5 w-3.5" />
                  {c}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-border p-3 space-y-3">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="scheduled"
                checked={isScheduled}
                onChange={(e) => setIsScheduled(e.target.checked)}
                className="h-4 w-4 accent-primary"
              />
              <label htmlFor="scheduled" className="text-xs font-medium cursor-pointer">
                Livraison à date programmée
              </label>
            </div>
            {isScheduled && (
              <div>
                <label className="mb-1 block text-xs text-muted">Date de livraison souhaitée</label>
                <Input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  min={new Date().toISOString().split("T")[0]}
                />
                {date && (
                  <p className="mt-1 text-[11px] text-muted">
                    <Calendar className="inline h-3 w-3 mr-1" />
                    Notification 1 jour avant la livraison
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
        <div className="flex gap-2 border-t border-border px-5 py-4">
          <Button variant="secondary" className="flex-1" onClick={onClose}>Annuler</Button>
          <Button
            className="flex-1"
            disabled={!company}
            onClick={() => onConfirm(company, isScheduled ? date : undefined)}
          >
            <Check className="h-3.5 w-3.5" />
            Confirmer
          </Button>
        </div>
      </div>
    </div>
  );
}

function OrderModal({
  order,
  customerStats,
  onClose,
  onDone,
}: {
  order: Order;
  customerStats?: CustomerStats;
  onClose: () => void;
  onDone: (updatedOrder: Partial<Order>, newStatus?: OrderStatus) => void;
}) {
  const attempts: CallAttempt[] = Array.isArray(order.callAttempts) ? order.callAttempts : [];

  const [customerName, setCustomerName] = useState(order.customerName ?? "");
  const [phone1, setPhone1] = useState(order.customerPhone ?? "");
  const [phone2, setPhone2] = useState(order.customerPhone2 ?? "");
  const [city, setCity] = useState(() => {
    const raw = (order.shippingAddress as any)?.city ?? "";
    if (isValidCity(raw)) return raw;
    return "";
  });
  const [address, setAddress] = useState((order.shippingAddress as any)?.address1 ?? "");
  const [internalNote, setInternalNote] = useState(order.internalNote ?? "");
  const [lineItems, setLineItems] = useState(
    order.lineItems.map((li) => ({
      id: li.id,
      productId: (li as any).productId ?? null,
      title: li.title,
      sku: li.sku ?? "",
      variantTitle: li.variantTitle ?? "",
      quantity: li.quantity,
      price: Number(li.price),
    }))
  );

  const [callPhone, setCallPhone] = useState(order.customerPhone ?? "");
  const [result, setResult] = useState<"ANSWERED_CONFIRMED" | "ANSWERED_REFUSED" | "NO_ANSWER" | "BUSY" | "WRONG_NUMBER" | "">("");
  const [callNote, setCallNote] = useState("");
  const [loading, setLoading] = useState(false);

  const [showCancelModal, setShowCancelModal] = useState(false);
  const [showDeliveryModal, setShowDeliveryModal] = useState(false);
  const [editability, setEditability] = useState<any>(null);
  const [cityError, setCityError] = useState(false);
  const [discountType, setDiscountType] = useState<"PERCENT" | "FIXED" | "">(
    (order as any).discountType ?? ""
  );
  const [discountValue, setDiscountValue] = useState(
    (order as any).discountValue ? String((order as any).discountValue) : ""
  );
  const [discountNote, setDiscountNote] = useState((order as any).discountNote ?? "");
  const { products: storeProducts, loading: loadingProducts } = useStoreProducts(order.storeId);
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API}/orders/${order.id}/editability`, {
          headers: { Authorization: `Bearer ${getToken()}` },
        });
        setEditability(await res.json());
      } catch {
        setEditability({ editable: true });
      }
    })();
  }, [order.id]);

  const isLocked = editability && editability.editable === false;
  const willRecreate = editability?.willRecreateParcel === true;
   // Original total from the source (Shopify/Converty) — never recalculated
   const [shippingCost, setShippingCost] = useState(Number(order.shippingTotal) || 0);
  const [shippingFree, setShippingFree] = useState(false);
  const [shippingReason, setShippingReason] = useState("");

  const [computedPrices, setComputedPrices] = useState<Record<string, number>>({});

  const [upsellPrices, setUpsellPrices] = useState<Record<string, any>>({});

  // Recompute line totals using upsells first, then quantity offers
  useEffect(() => {
    (async () => {
      const skus = lineItems.map((li) => li.sku).filter(Boolean) as string[];

      // 1. Check upsells
      let upsells: Record<string, any> = {};
      if (skus.length > 1) {
        try {
          const res = await fetch(`${API}/upsells/compute/${order.storeId}`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${getToken()}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ skus }),
          });
          const data = await res.json();
          upsells = data.prices ?? {};
        } catch {}
      }
      setUpsellPrices(upsells);

      // 2. Compute each line
      const results: Record<string, number> = {};
      await Promise.all(
        lineItems.map(async (li, idx) => {
          const qty = Number(li.quantity) || 0;

          // Upsell price wins
          if (li.sku && upsells[li.sku]) {
            results[idx] = upsells[li.sku].price * qty;
            return;
          }

          if (!li.sku) {
            results[idx] = (Number(li.price) || 0) * qty;
            return;
          }

          try {
            const res = await fetch(
              `${API}/products/price/${order.storeId}/${encodeURIComponent(li.sku)}?quantity=${qty}`,
              { headers: { Authorization: `Bearer ${getToken()}` } }
            );
            const data = await res.json();
            results[idx] = data.total > 0
              ? data.total
              : (Number(li.price) || 0) * qty;
          } catch {
            results[idx] = (Number(li.price) || 0) * qty;
          }
        })
      );
      setComputedPrices(results);
    })();
  }, [lineItems, order.storeId]);

  const productsTotal = lineItems.reduce(
    (s, li, idx) => s + (computedPrices[idx] ?? (Number(li.price) || 0) * (Number(li.quantity) || 0)),
    0
  );
  // Recalculate shipping when products or city change
  useEffect(() => {
    if (productsTotal <= 0) {
      setShippingCost(0);
      setShippingFree(false);
      setShippingReason("Commande vide");
      return;
    }
    (async () => {
      try {
        const res = await fetch(
          `${API}/shipping/calculate/${order.storeId}?subtotal=${productsTotal}&city=${encodeURIComponent(city)}`,
          { headers: { Authorization: `Bearer ${getToken()}` } }
        );
        const data = await res.json();
        setShippingCost(data.cost ?? 0);
        setShippingFree(data.isFree ?? false);
        setShippingReason(data.reason ?? "");
      } catch {
        setShippingCost(Number(order.shippingTotal) || 0);
      }
    })();
  }, [productsTotal, city, order.storeId]);

  const subtotalCalc = productsTotal + shippingCost;
 
   const discountAmount =
     discountType === "PERCENT"
       ? (subtotalCalc * parseFloat(discountValue || "0")) / 100
       : discountType === "FIXED"
       ? parseFloat(discountValue || "0")
       : 0;
 
   const total = Math.max(0, subtotalCalc - discountAmount);

   function updateLineItem(idx: number, field: string, value: any) {
    setLineItems((prev) => prev.map((li, i) => i === idx ? { ...li, [field]: value } : li));
  }
  function removeLineItem(idx: number) {
    setLineItems((prev) => prev.filter((_, i) => i !== idx));
  }

  function addLineItem() {
    setLineItems((prev) => [...prev, { id: "", productId: null, title: "", sku: "", variantTitle: "", quantity: 1, price: 0 }]);
  }
  

  async function saveOrder() {
    if (isLocked) return { ok: false, locked: true };

    const res = await fetch(`${API}/orders/${order.id}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${getToken()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        customerName,
        customerPhone: phone1,
        customerPhone2: phone2,
        shippingAddress: { city, address1: address },
        internalNote,
        total: total,
        subtotal: productsTotal,
        shippingTotal: shippingCost,
        discountType: discountType || null,
        discountValue: discountValue ? parseFloat(discountValue) : null,
        discountNote: discountNote || null,
        lineItems: lineItems.map((li) => ({
          title: li.title,
          sku: li.sku,
          variantTitle: li.variantTitle,
          quantity: li.quantity,
          price: li.price,
        })),
      }),
    });

    const data = await res.json();

    if (data.locked) {
      alert(data.error);
      return data;
    }

    if (data.recreated) {
      if (data.recreated.ok) {
        alert(
          `Le colis Cosmos a ete recree.\n\n` +
          `Nouveau code-barres : ${data.recreated.newBarcode}\n\n` +
          `Le bordereau doit etre reimprime.`
        );
      } else {
        alert(
          `Attention : le colis Cosmos n'a pas pu etre mis a jour.\n\n` +
          `${data.recreated.error}\n\n` +
          `Verifiez chez Cosmos avant expedition.`
        );
      }
    }

    await processMentions(internalNote, {
      link: "/confirmation",
      orderId: order.id,
      orderNumber: order.orderNumber,
    });

    return data;
  }

  async function logAttempt(cancelReason?: string, cancelNote?: string, deliveryCompany?: string, scheduledDate?: string) {
    setLoading(true);
    try {
      await saveOrder();

      const newAttempt: CallAttempt = {
        id: Date.now().toString(),
        date: new Date().toISOString(),
        phone: callPhone,
        result: result as CallAttempt["result"],
        note: callNote || null,
      };
      const updatedAttempts = [...attempts, newAttempt];

      await fetch(`${API}/orders/${order.id}/call-attempts`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${getToken()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ callAttempts: updatedAttempts }),
      });
      await processMentions(callNote, {
        link: "/confirmation",
        orderId: order.id,
        orderNumber: order.orderNumber,
      });

      let newStatus: OrderStatus | undefined;

      if (result === "ANSWERED_CONFIRMED" && deliveryCompany) {
        await fetch(`${API}/orders/${order.id}`, {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${getToken()}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            deliveryCompany,
            scheduledDeliveryDate: scheduledDate || null,
          }),
        });

        newStatus = "A_PREPARER";

        await fetch(`${API}/orders/${order.id}/status`, {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${getToken()}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ status: newStatus }),
        });
      } else if (result === "ANSWERED_REFUSED" && cancelReason) {
        await fetch(`${API}/orders/${order.id}/status`, {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${getToken()}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ status: "ANNULE", reason: cancelReason, note: cancelNote }),
        });
        newStatus = "ANNULE";
      } else {
        await fetch(`${API}/orders/${order.id}/status`, {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${getToken()}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ status: "CONFIRMATION_EN_COURS" }),
        });
        newStatus = "CONFIRMATION_EN_COURS";
      }

      onDone({
        customerName,
        customerPhone: phone1,
        customerPhone2: phone2,
        callAttempts: updatedAttempts,
        internalNote,
      }, newStatus);
      onClose();
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  function handleLog() {
    if (result === "ANSWERED_CONFIRMED" && !isValidCity(city)) {
      setCityError(true);
      return;
    }
    setCityError(false);

    if (result === "ANSWERED_REFUSED") {
      setShowCancelModal(true);
    } else if (result === "ANSWERED_CONFIRMED") {
      setShowDeliveryModal(true);
    } else {
      logAttempt();
    }
  }

  async function handleSaveOnly() {
    if (city && !isValidCity(city)) {
      setCityError(true);
      return;
    }
    setCityError(false);
    setLoading(true);
    try {
      await saveOrder();
      onDone({ customerName, customerPhone: phone1, customerPhone2: phone2, internalNote });
      onClose();
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30 backdrop-blur-[2px]">
        <div className="w-full max-w-4xl rounded-xl border border-border bg-surface shadow-2xl max-h-[90vh] flex flex-col">
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
              <h2 className="text-sm font-semibold">Commande {order.orderNumber}</h2>
              <p className="text-xs text-muted">{order.storeName}</p>
              {customerStats && <CustomerBadges stats={customerStats} />}
            </div>
            <div className="flex items-center gap-2">
              <OrderStatusBadge status={order.orderStatus} />
              <button onClick={onClose} className="rounded-md p-1 hover:bg-surface-sunken">
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {isLocked && (
              <div className="flex items-start gap-2.5 border-b border-status-cancelled/30 bg-status-cancelled-bg px-5 py-3">
                <Lock className="mt-0.5 h-4 w-4 shrink-0 text-status-cancelled" />
                <div className="text-xs text-status-cancelled">
                  <p className="font-semibold">Modification impossible</p>
                  <p className="mt-0.5">
                    {editability?.reason}. Contactez directement le transporteur.
                  </p>
                </div>
              </div>
            )}

            {!isLocked && willRecreate && (
              <div className="flex items-start gap-2.5 border-b border-status-processing/30 bg-status-processing-bg px-5 py-3">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-status-processing" />
                <div className="text-xs text-status-processing">
                  <p className="font-semibold">Colis deja cree chez le transporteur</p>
                  <p className="mt-0.5">
                    Toute modification supprimera et recreera le colis
                    {editability?.barcode && ` (${editability.barcode})`}.
                    Le bordereau devra etre reimprime.
                  </p>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 divide-x divide-border">

              {/* LEFT — Edit order */}
              <div className="p-5 space-y-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted">Modifier la commande</p>

                <div className="space-y-2.5">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-muted">Nom client</label>
                    <Input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Nom complet" disabled={isLocked} />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-muted">Téléphone 1</label>
                      <Input value={phone1} onChange={(e) => setPhone1(e.target.value)} placeholder="+216 XX XXX XXX" disabled={isLocked} />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-muted">Téléphone 2</label>
                      <Input value={phone2} onChange={(e) => setPhone2(e.target.value)} placeholder="+216 XX XXX XXX" disabled={isLocked} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                  <div>
                      <label className="mb-1 block text-xs font-medium text-muted">
                        Gouvernorat <span className="text-status-cancelled">*</span>
                      </label>
                      <CityPicker
                        value={city}
                        onChange={setCity}
                        address={address}
                        disabled={isLocked}
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-muted">Adresse</label>
                      <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Rue..." disabled={isLocked} />
                    </div>
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-medium text-muted">
                      Produits
                      <span className="ml-1 text-[10px] text-muted-light">
                        ({storeProducts.length} au catalogue)
                      </span>
                    </label>
                    <button onClick={addLineItem} disabled={isLocked} className="flex items-center gap-1 text-xs font-medium text-primary hover:underline disabled:opacity-40">
                      <Plus className="h-3 w-3" /> Ajouter
                    </button>
                  </div>
                  <div className="space-y-2">
                  {lineItems.map((li, idx) => {
                      const prod = storeProducts.find(
                        (p: any) => p.id === (li as any).productId || p.sku === li.sku
                      );
                      const unitPrice =
                        li.sku && upsellPrices[li.sku]
                          ? upsellPrices[li.sku].price
                          : Number(li.price);

                      return (
                        <div
                          key={idx}
                          className="flex items-center gap-2.5 rounded-lg border border-border px-2.5 py-2"
                        >
                          {(prod as any)?.imageUrl ? (
                            <img
                              src={(prod as any).imageUrl}
                              alt=""
                              className="h-9 w-9 shrink-0 rounded object-cover border border-border"
                            />
                          ) : (
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded border border-border bg-surface-sunken">
                              <Package className="h-3.5 w-3.5 text-muted-light" />
                            </div>
                          )}

                          <div className="min-w-0 flex-1">
                            <ProductPicker
                              value={li.title}
                              productId={(li as any).productId}
                              onSelect={(prod2, raw) => {
                                if (prod2) {
                                  setLineItems((prev) =>
                                    prev.map((x, i) =>
                                      i === idx
                                        ? {
                                            ...x,
                                            productId: prod2.id,
                                            title: prod2.name,
                                            sku: prod2.sku,
                                            price: (prod2 as any).price ?? (prod2 as any).sellPrice ?? 0,
                                          }
                                        : x
                                    )
                                  );
                                } else {
                                  updateLineItem(idx, "title", raw);
                                }
                              }}
                              products={storeProducts}
                              loading={loadingProducts}
                              className="w-full"
                            />
                            {li.variantTitle && (
                              <span className="mt-0.5 inline-block rounded bg-surface-sunken px-1.5 py-0.5 text-[10px] text-muted">
                                {li.variantTitle}
                              </span>
                            )}
                          </div>

                          <div className="flex shrink-0 items-center gap-1">
                            <span className="text-[10px] text-muted">Qté</span>
                            <Input
                              type="number"
                              value={li.quantity}
                              onChange={(e) => updateLineItem(idx, "quantity", parseInt(e.target.value) || 1)}
                              min={1}
                              disabled={isLocked}
                              className="h-7 w-14 text-xs"
                            />
                          </div>

                          <div className="w-20 shrink-0 text-right">
                            <span className="font-mono text-xs font-semibold">
                              {unitPrice.toFixed(3)}
                            </span>
                            {li.sku && upsellPrices[li.sku] && (
                              <p className="text-[9px] font-medium text-status-delivered">
                                upsell
                              </p>
                            )}
                          </div>

                          <button
                            onClick={() => removeLineItem(idx)}
                            disabled={isLocked}
                            className="shrink-0 text-muted hover:text-status-cancelled disabled:opacity-40"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="rounded-lg border border-border p-3 space-y-2">
                  <p className="text-[11px] font-medium text-muted">Remise (optionnel)</p>
                  <div className="flex gap-2">
                    <div className="flex rounded-md border border-border overflow-hidden">
                      {[
                        { key: "", label: "Aucune" },
                        { key: "PERCENT", label: "%" },
                        { key: "FIXED", label: "TND" },
                      ].map((t) => (
                        <button
                          key={t.key}
                          type="button"
                          onClick={() => { setDiscountType(t.key as any); setDiscountValue(""); }}
                          className={cn(
                            "px-3 py-1.5 text-xs font-medium transition-colors",
                            discountType === t.key
                              ? "bg-primary text-white"
                              : "bg-surface text-muted hover:bg-surface-sunken"
                          )}
                        >
                          {t.label}
                        </button>
                      ))}
                    </div>
                    {discountType && (
                      <Input
                        type="number"
                        value={discountValue}
                        onChange={(e) => setDiscountValue(e.target.value)}
                        placeholder={discountType === "PERCENT" ? "ex: 10" : "ex: 5.000"}
                        min={0}
                        step="0.001"
                        className="h-8 flex-1 text-xs"
                      />
                    )}
                  </div>
                  {discountType && discountValue && (
                    <Input
                      value={discountNote}
                      onChange={(e) => setDiscountNote(e.target.value)}
                      placeholder="Raison de la remise..."
                      className="h-7 text-xs"
                    />
                  )}
                </div>

                <div className="space-y-1 px-1">
                  <div className="flex justify-between">
                    <span className="text-xs text-muted">Produits</span>
                    <span className="font-mono text-xs">{productsTotal.toFixed(3)} TND</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-xs text-muted">
                      Livraison
                      {shippingFree && (
                        <span className="ml-1 rounded bg-status-delivered-bg px-1.5 py-0.5 text-[10px] font-medium text-status-delivered">
                          gratuite
                        </span>
                      )}
                    </span>
                    <span className="font-mono text-xs">{shippingCost.toFixed(3)} TND</span>
                  </div>
                  {discountAmount > 0 && (
                    <div className="flex justify-between">
                      <span className="text-xs text-status-cancelled">
                        Remise {discountType === "PERCENT" ? `${discountValue}%` : ""}
                      </span>
                      <span className="font-mono text-xs text-status-cancelled">
                        -{discountAmount.toFixed(3)} TND
                      </span>
                    </div>
                  )}
                </div>

                <div className="flex justify-between items-center rounded-lg bg-surface-sunken px-3 py-2">
                  <span className="text-xs font-medium text-muted">Total</span>
                  <span className="font-mono text-sm font-bold">{formatMoney(total, order.currency)}</span>
                </div>

                <div>
                <label className="mb-1 block text-xs font-medium text-muted">
                    Note livreur
                    <span className="ml-1 text-[10px] font-normal text-muted-light">
                      apparaît sur le bordereau
                    </span>
                  </label>
                  <MentionInput
                    value={internalNote}
                    onChange={setInternalNote}
                    placeholder="Note pour l'équipe... (@ pour mentionner)"
                    multiline
                    rows={2}
                  />
                </div>
              </div>

              {/* RIGHT — Call log */}
              <div className="p-5 space-y-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                  Appel de confirmation ({attempts.length} tentative{attempts.length > 1 ? "s" : ""})
                </p>

                {attempts.length > 0 && (
                  <div className="rounded-lg border border-border divide-y divide-border">
                    {attempts.map((a, i) => (
                      <div key={a.id} className="px-3 py-2">
                        <div className="flex justify-between text-xs">
                          <span className="font-medium text-muted">Tentative {i + 1} — {a.phone}</span>
                          <span className={cn("font-medium", RESULT_COLORS[a.result] ?? "text-muted")}>
                            {RESULT_LABELS[a.result] ?? a.result}
                          </span>
                        </div>
                        <p className="text-[11px] text-muted-light mt-0.5">
                          {new Date(a.date).toLocaleString("fr-FR")}
                          {a.note && <> — <MentionText text={a.note} /></>}
                        </p>
                      </div>
                    ))}
                  </div>
                )}

                <div className="space-y-2.5">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-muted">Numéro appelé</label>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setCallPhone(phone1)}
                        className={cn("rounded-md border px-2 py-1 text-xs transition-colors", callPhone === phone1 ? "border-primary bg-primary-soft text-primary" : "border-border text-muted")}
                      >
                        Tel 1
                      </button>
                      {phone2 && (
                        <button
                          onClick={() => setCallPhone(phone2)}
                          className={cn("rounded-md border px-2 py-1 text-xs transition-colors", callPhone === phone2 ? "border-primary bg-primary-soft text-primary" : "border-border text-muted")}
                        >
                          Tel 2
                        </button>
                      )}
                    </div>
                    <Input
                      value={callPhone}
                      onChange={(e) => setCallPhone(e.target.value)}
                      placeholder="+216 XX XXX XXX"
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-muted">Résultat</label>
                    <div className="flex flex-col gap-3">
                      {[
                        {
                          value: "ANSWERED_CONFIRMED",
                          label: "Confirmé",
                          sub: "Client a accepté la commande",
                          Icon: CheckCircle2,
                          badge: { idle: "bg-emerald-100 text-emerald-600", sel: "bg-emerald-600 text-white" },
                          title: "text-emerald-700",
                          card: { idle: "bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50", sel: "bg-emerald-50/60 border-emerald-500 shadow-sm" },
                          radio: "bg-emerald-600 border-emerald-600",
                        },
                        {
                          value: "ANSWERED_REFUSED",
                          label: "Refusé",
                          sub: "Client a refusé",
                          Icon: X,
                          badge: { idle: "bg-red-100 text-red-600", sel: "bg-red-600 text-white" },
                          title: "text-red-700",
                          card: { idle: "bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50", sel: "bg-red-50/60 border-red-500 shadow-sm" },
                          radio: "bg-red-600 border-red-600",
                        },
                        {
                          value: "NO_ANSWER",
                          label: "Pas de réponse",
                          sub: "Personne n'a décroché",
                          Icon: PhoneMissed,
                          badge: { idle: "bg-slate-100 text-slate-500", sel: "bg-slate-600 text-white" },
                          title: "text-slate-700",
                          card: { idle: "bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50", sel: "bg-slate-50/60 border-slate-500 shadow-sm" },
                          radio: "bg-slate-600 border-slate-600",
                        },
                        {
                          value: "BUSY",
                          label: "Occupé",
                          sub: "Ligne occupée",
                          Icon: Clock,
                          badge: { idle: "bg-amber-100 text-amber-600", sel: "bg-amber-500 text-white" },
                          title: "text-amber-700",
                          card: { idle: "bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50", sel: "bg-amber-50/60 border-amber-500 shadow-sm" },
                          radio: "bg-amber-500 border-amber-500",
                        },
                        {
                          value: "WRONG_NUMBER",
                          label: "Mauvais numéro",
                          sub: "Numéro incorrect",
                          Icon: PhoneOff,
                          badge: { idle: "bg-violet-100 text-violet-600", sel: "bg-violet-600 text-white" },
                          title: "text-violet-700",
                          card: { idle: "bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50", sel: "bg-violet-50/60 border-violet-500 shadow-sm" },
                          radio: "bg-violet-600 border-violet-600",
                        },
                      ].map((r) => {
                        const isSelected = result === r.value;
                        const Icon = r.Icon;
                        return (
                          <button
                            key={r.value}
                            type="button"
                            aria-pressed={isSelected}
                            onClick={() => setResult(r.value as any)}
                            className={cn(
                              "flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-all duration-150",
                              isSelected ? r.card.sel : r.card.idle
                            )}
                          >
                                                     <div className={cn(
                              "flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-all duration-150",
                              isSelected ? r.badge.sel : r.badge.idle
                            )}>
                                                            <Icon className="h-4 w-4" strokeWidth={2.5} />
                            </div>
                            <div className="min-w-0 flex-1">
                            <p className={cn("text-[15px] font-bold leading-tight", r.title)}>
                                {r.label}
                              </p>
                              <p className="mt-0.5 text-[13px] text-slate-500">{r.sub}</p>
                            </div>
                            <div className={cn(
                              "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition-all duration-150",
                              isSelected ? r.radio : "border-slate-300 bg-white"
                            )}>
                              {isSelected && (
                                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 12 12">
                                  <path d="M2 6l3 3 5-5" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div>
                  <label className="mb-1 block text-xs font-medium text-muted">
                      Note équipe
                      <span className="ml-1 text-[10px] font-normal text-muted-light">
                        interne, @ pour mentionner
                      </span>
                    </label>
                    <MentionInput
                      value={callNote}
                      onChange={setCallNote}
                      placeholder="ex: rappeler demain (@ pour mentionner)"
                    />
                  </div> 
                </div>

                {order.scheduledDeliveryDate && (
                  <div className="rounded-lg bg-primary-soft px-3 py-2">
                    <p className="text-xs font-medium text-primary flex items-center gap-1.5">
                      <Calendar className="h-3.5 w-3.5" />
                      Livraison programmée: {new Date(order.scheduledDeliveryDate).toLocaleDateString("fr-FR")}
                    </p>
                  </div>
                )}

                {order.deliveryCompany && (
                  <div className="rounded-lg border border-border px-3 py-2">
                    <p className="text-xs text-muted flex items-center gap-1.5">
                      <Truck className="h-3.5 w-3.5" />
                      Livreur: <span className="font-medium text-foreground">{order.deliveryCompany}</span>
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
          {cityError && (
            <div className="flex items-start gap-2.5 border-t border-status-cancelled/30 bg-status-cancelled-bg px-5 py-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-status-cancelled" />
              <div className="text-xs text-status-cancelled">
                <p className="font-semibold">Gouvernorat obligatoire</p>
                <p className="mt-0.5">
                  Demandez au client son gouvernorat et selectionnez-le dans la liste.
                  Sans cela, le colis ne peut pas etre cree chez le transporteur.
                </p>
              </div>
            </div>
          )}

          <div className="flex gap-2 border-t border-border px-5 py-4">
            <Button variant="secondary" onClick={onClose}>Fermer</Button>
            <Button variant="outline" onClick={handleSaveOnly} disabled={loading || isLocked}>
              <Edit2 className="h-3.5 w-3.5" />
              Sauvegarder
            </Button>
            <Button className="flex-1" disabled={loading || !callPhone || isLocked} onClick={handleLog}>
              <Phone className="h-3.5 w-3.5" />
              {loading ? "Enregistrement..." : `Logger tentative ${attempts.length + 1}`}
            </Button>
          </div>
        </div>
      </div>

      {showCancelModal && (
        <CancellationModal
          onClose={() => setShowCancelModal(false)}
          onConfirm={(reason, note) => {
            setShowCancelModal(false);
            logAttempt(reason, note);
          }}
        />
      )}

      {showDeliveryModal && (
        <DeliveryModal
          storeId={order.storeId}
          onClose={() => setShowDeliveryModal(false)}
          onConfirm={(company, date) => {
            setShowDeliveryModal(false);
            logAttempt(undefined, undefined, company, date);
          }}
        />
      )}
    </>
  );
}

const PAGE_SIZE = 25;

function ConfirmationContent() {
  const { canAccessStore } = useAuth();
  const { stores } = useStores();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedStoreIds, setSelectedStoreIds] = useState<string[]>([]);
  const [activeOrder, setActiveOrder] = useState<Order | null>(null);
  const [tagOrder, setTagOrder] = useState<Order | null>(null);
  const [archiveOrder, setArchiveOrder] = useState<Order | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [detectingLoyal, setDetectingLoyal] = useState(false);
  const [customerStats, setCustomerStats] = useState<Record<string, CustomerStats>>({});
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState<"all" | "pending" | "confirmed" | "refused" | "a_verifier">("all");
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
      const allOrders: Order[] = data.orders ?? [];

      // Hide archived orders
      const visible = allOrders.filter((o) => o.orderStatus !== "ARCHIVE");

      setOrders(visible);
    } catch {
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Load customer stats for badges
  const fetchCustomerStats = useCallback(async () => {
    try {
      const res = await fetch(`${API}/orders/stats/customers`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const data = await res.json();
      if (!Array.isArray(data)) return;
      const map: Record<string, CustomerStats> = {};
      for (const c of data) {
        map[c.phone] = {
          phone: c.phone,
          totalOrders: c.totalOrders,
          confirmationRate: c.confirmationRate,
          deliveryRate: c.deliveryRate,
          returnRate: c.returnRate,
          lifetimeValue: c.lifetimeValue,
          avgBasket: c.avgBasket,
        };
      }
      setCustomerStats(map);
    } catch {
      setCustomerStats({});
    }
  }, []);

  useEffect(() => {
    fetchOrders();
    fetchCustomerStats();
  }, [fetchOrders, fetchCustomerStats]);

  function handleDone(orderId: string, updatedFields: Partial<Order>, newStatus?: OrderStatus) {
    setOrders((prev) =>
      prev.map((o) => {
        if (o.id !== orderId) return o;
        return {
          ...o,
          ...updatedFields,
          orderStatus: newStatus ?? o.orderStatus,
        };
      })
    );
    fetchOrders();
  }
  async function detectLoyalCustomers() {
    setDetectingLoyal(true);
    try {
      const res = await fetch(`${API}/orders/detect-loyal-customers`, {
        method: "POST",
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const data = await res.json();
      alert(
        `${data.loyalCustomers} clients fidèles détectés.\n` +
        `${data.tagged} commandes taguées, ${data.untagged} tags retirés.`
      );
      fetchOrders();
    } catch (e) {
      console.error(e);
    } finally {
      setDetectingLoyal(false);
    }
  }
  async function archive(orderId: string) {
    setOrders((prev) => prev.filter((o) => o.id !== orderId));
    await fetch(`${API}/orders/${orderId}/status`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${getToken()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ status: "ARCHIVE" }),
    });
  }

  const filtered = orders.filter((o) => {
    if (!selectedStoreIds.includes(o.storeId)) return false;
    if (!isInPeriod(o.sourceCreatedAt, period)) return false;
    if (!applyAdvancedFilters(o, advFilters)) return false;
    if (search) {
      const q = search.toLowerCase();
      const hay = `${o.orderNumber} ${o.customerName ?? ""} ${o.customerPhone ?? ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    const attempts = Array.isArray(o.callAttempts) ? o.callAttempts as CallAttempt[] : [];
    const confirmed = attempts.some((a) => a.result === "ANSWERED_CONFIRMED");
    const refused = attempts.some((a) => a.result === "ANSWERED_REFUSED");
    if (filter === "confirmed") return confirmed;
    if (filter === "refused") return refused || o.orderStatus === "ANNULE";
    if (filter === "pending") return !confirmed && !refused && o.orderStatus !== "ANNULE";
    if (filter === "a_verifier") return o.orderStatus === "A_VERIFIER";
    return true;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageOrders = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Orders matching the stats filters (period + delivery + product)
  const statsOrders = orders.filter((o) => {
    if (!selectedStoreIds.includes(o.storeId)) return false;
    if (!isInPeriod(o.sourceCreatedAt, period)) return false;
    if (!applyAdvancedFilters(o, advFilters)) return false;
    return true;
  });

  const statsTotal = statsOrders.length;

  const confirmedCount = statsOrders.filter((o) => {
    const attempts = Array.isArray(o.callAttempts) ? o.callAttempts as CallAttempt[] : [];
    return attempts.some((a) => a.result === "ANSWERED_CONFIRMED");
  }).length;

  const refusedCount = statsOrders.filter((o) => {
    const attempts = Array.isArray(o.callAttempts) ? o.callAttempts as CallAttempt[] : [];
    return attempts.some((a) => a.result === "ANSWERED_REFUSED") || o.orderStatus === "ANNULE";
  }).length;

  const aVerifierCount = statsOrders.filter((o) => o.orderStatus === "A_VERIFIER").length;
  const pendingCount = statsTotal - confirmedCount - refusedCount - aVerifierCount;

  const totalAttempts = statsOrders.reduce((s, o) => {
    const attempts = Array.isArray(o.callAttempts) ? o.callAttempts as CallAttempt[] : [];
    return s + attempts.length;
  }, 0);

  const avgAttempts = statsTotal > 0 ? (totalAttempts / statsTotal).toFixed(1) : "0";

  const revenue = statsOrders
    .filter((o) => {
      const attempts = Array.isArray(o.callAttempts) ? o.callAttempts as CallAttempt[] : [];
      return attempts.some((a) => a.result === "ANSWERED_CONFIRMED");
    })
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
          <h1 className="text-base font-semibold">Confirmation</h1>
          <div className="flex items-center gap-2">
          <Button
              size="sm"
              variant="secondary"
              onClick={detectLoyalCustomers}
              disabled={detectingLoyal}
            >
              <Sparkles className="h-3.5 w-3.5" />
              {detectingLoyal ? "Détection..." : "Détecter clients fidèles"}
            </Button>
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
          <StatCard label="Total" value={statsTotal} color="gray" />
          <StatCard label="Confirmés" value={confirmedCount} total={statsTotal} color="green" />
          <StatCard label="Refusés" value={refusedCount} total={statsTotal} color="red" />
          <StatCard label="En attente" value={pendingCount} total={statsTotal} color="orange" />
          <StatCard label="À vérifier" value={aVerifierCount} total={statsTotal} color="red" />
          <div className="rounded-lg bg-primary-soft px-4 py-3">
            <p className="text-[11px] font-medium text-primary">CA confirmé</p>
            <p className="mt-1 text-2xl font-bold text-primary font-mono">
              {revenue.toLocaleString("fr-FR", { maximumFractionDigits: 0 })}
            </p>
            <p className="mt-1 text-[10px] text-primary/70">
              Moy. {avgAttempts} tentative{Number(avgAttempts) > 1 ? "s" : ""}/commande
            </p>
          </div>
        </div>

       {/* Filters */}
       <div className="border-b border-border bg-surface px-5 py-3 space-y-2">
          <div className="flex items-center gap-3">
          <div className="relative w-64">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-light" />
            <Input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="Rechercher commande, client..."
              className="pl-8"
            />
          </div>
          <AdvancedFilters filters={advFilters} onChange={setAdvFilters} orders={orders} />
          <div className="flex gap-1">
            {[
              { key: "all", label: "Tous", count: orders.length },
              { key: "pending", label: "En attente", count: pendingCount },
              { key: "confirmed", label: "Confirmés", count: confirmedCount },
              { key: "refused", label: "Refusés", count: refusedCount },
              { key: "a_verifier", label: "À vérifier", count: aVerifierCount },
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => { setFilter(tab.key as any); setPage(1); }}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                  filter === tab.key ? "bg-primary-soft text-primary" : "text-muted hover:bg-surface-sunken"
                )}
              >
                {tab.label}
                <span className={cn("rounded-full px-1.5 py-0.5 text-[10px]", filter === tab.key ? "bg-primary text-white" : "bg-surface-sunken")}>
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
                  <th className="px-4 py-2.5">Commande</th>
                  <th className="px-4 py-2.5">Date</th>
                  <th className="px-4 py-2.5">Client</th>
                  <th className="px-4 py-2.5">Téléphone</th>
                  <th className="px-4 py-2.5">Produits</th>
                  <th className="px-4 py-2.5">Total</th>
                  <th className="px-4 py-2.5">Statut</th>
                  <th className="px-4 py-2.5">Appel</th>
                  <th className="px-4 py-2.5">Livreur</th>
                  <th className="px-4 py-2.5">Agent</th>
                  <th className="px-4 py-2.5">Tags</th>
                  <th className="px-4 py-2.5">Actions</th>
                </tr>
              </thead>
              <tbody>
                {pageOrders.map((order) => {
                  const attempts = Array.isArray(order.callAttempts) ? order.callAttempts as CallAttempt[] : [];
                  const isRefused = attempts.some((a) => a.result === "ANSWERED_REFUSED") || order.orderStatus === "ANNULE";
                  const isConfirmed = attempts.some((a) => a.result === "ANSWERED_CONFIRMED");
                  const isAVerifier = order.orderStatus === "A_VERIFIER";

                  return (
                    <tr
                      key={order.id}
                      className={cn(
                        "border-b border-border transition-colors hover:bg-surface-sunken cursor-pointer",
                        isConfirmed && "bg-status-delivered-bg/20",
                        isRefused && "bg-status-cancelled-bg/20",
                        isAVerifier && "bg-status-cancelled-bg/30",
                      )}
                      onClick={() => setActiveOrder(order)}
                    >
                      <td className="px-4 py-3">
                        <span className="font-mono text-[13px] font-semibold">{order.orderNumber}</span>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted whitespace-nowrap">
                        {formatDate(order.sourceCreatedAt)}
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium truncate max-w-[160px]">{order.customerName ?? "—"}</p>
                        {order.customerPhone2 && (
                          <p className="text-[11px] text-muted font-mono">{order.customerPhone2}</p>
                        )}
                                           <CustomerBadges stats={customerStats[normalizePhone(order.customerPhone)]} />
                        {order.deliveryCompany === "Cosmos" &&
                          !isValidCity((order.shippingAddress as any)?.city) && (
                            <span className="mt-1 inline-flex items-center gap-1 rounded bg-status-cancelled-bg px-1.5 py-0.5 text-[10px] font-medium text-status-cancelled">
                              <AlertTriangle className="h-2.5 w-2.5" />
                              gouvernorat manquant
                            </span>
                          )}
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
                      <td className="px-4 py-3">
                        <OrderStatusBadge status={order.orderStatus} />
                      </td>
                      <td className="px-4 py-3">
                        <CallStatusBadge attempts={attempts} />
                      </td>
                      <td className="px-4 py-3 text-xs text-muted">
                        {order.deliveryCompany ?? "—"}
                        {order.scheduledDeliveryDate && (
                          <p className="text-[11px] text-primary">
                            <Calendar className="inline h-3 w-3 mr-0.5" />
                            {new Date(order.scheduledDeliveryDate).toLocaleDateString("fr-FR")}
                          </p>
                        )}
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
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <div className="flex flex-wrap gap-1 max-w-[150px]">
                          {(order.tags ?? []).map((t) => (
                            <TagBadge key={t} tag={t} />
                          ))}
                          <button
                            onClick={() => setTagOrder(order)}
                            className="rounded-full border border-dashed border-border px-2 py-0.5 text-[11px] text-muted hover:border-border-strong hover:text-foreground"
                          >
                            + Tag
                          </button>
                        </div>
                      </td>
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-1.5">
                          <Button
                            size="sm"
                            variant={isConfirmed ? "secondary" : isAVerifier ? "destructive" : "default"}
                            onClick={() => setActiveOrder(order)}
                          >
                            <Phone className="h-3.5 w-3.5" />
                            {isAVerifier ? "Vérifier" : isConfirmed ? "Modifier" : attempts.length === 0 ? "Appeler" : `T.${attempts.length + 1}`}
                          </Button>
                         
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
                  );
                })}
              </tbody>
            </table>
          )}

          {!loading && pageOrders.length === 0 && (
            <div className="flex flex-col items-center justify-center py-24">
              <Phone className="h-8 w-8 text-muted-light" />
              <p className="mt-2 text-sm font-medium">Aucune commande</p>
            </div>
          )}
        </div>

        <footer className="flex shrink-0 items-center justify-between border-t border-border bg-surface px-5 py-2.5">
          <p className="text-xs text-muted">{filtered.length} commandes</p>
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

      {activeOrder && (
        <OrderModal
          order={activeOrder}
          customerStats={customerStats[normalizePhone(activeOrder.customerPhone)]}
          onClose={() => setActiveOrder(null)}
          onDone={(updatedFields, newStatus) => {
            handleDone(activeOrder.id, updatedFields, newStatus);
            setActiveOrder(null);
          }}
        />
      )}

      {tagOrder && (
        <TagPicker
          orderId={tagOrder.id}
          currentTags={tagOrder.tags ?? []}
          onUpdate={(newTags) => {
            setOrders((prev) =>
              prev.map((o) => o.id === tagOrder.id ? { ...o, tags: newTags } : o)
            );
            setTagOrder(null);
          }}
          onClose={() => setTagOrder(null)}
        />
      )}

      {archiveOrder && (
        <ArchiveModal
          order={archiveOrder}
          onClose={() => setArchiveOrder(null)}
          onConfirm={() => {
            archive(archiveOrder.id);
            setArchiveOrder(null);
          }}
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

export default function ConfirmationPage() {
  return (
    <RouteGuard>
      <ConfirmationContent />
    </RouteGuard>
  );
}

