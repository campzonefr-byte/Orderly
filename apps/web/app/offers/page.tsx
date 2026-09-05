"use client";

import { useState, useEffect, useCallback } from "react";
import { Sidebar } from "@/components/layout/sidebar";
import { RouteGuard } from "@/components/auth/route-guard";
import { useStores } from "@/lib/stores-context";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  Plus, X, Tag, Package, Search, Settings2,
  Trash2, ChevronDown, ChevronUp,RefreshCw,
} from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api";

function getToken() {
  return window.localStorage.getItem("orderly_token");
}

interface Offer {
  id: string;
  quantity: number;
  priceType: string;
  price: string | null;
  percent: string | null;
}

function OfferModal({
  product,
  onClose,
  onSaved,
}: {
  product: any;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [offers, setOffers] = useState<Offer[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [qty, setQty] = useState("2");
  const [type, setType] = useState<"FIXED" | "PERCENT">("FIXED");
  const [price, setPrice] = useState("");
  const [percent, setPercent] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");

  const basePrice = Number(product.sellPrice ?? 0);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/products/${product.id}/offers`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const data = await res.json();
      setOffers(Array.isArray(data) ? data : []);
    } catch {
      setOffers([]);
    } finally {
      setLoading(false);
    }
  }, [product.id]);

  useEffect(() => {
    load();
  }, [load]);

  async function addOffer() {
    const q = parseInt(qty);
    if (!q || q < 2) return;
    if (type === "FIXED" && !price) return;
    if (type === "PERCENT" && !percent) return;

    setBusy(true);
    try {
      await fetch(`${API}/products/${product.id}/offers`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${getToken()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
            quantity: q,
            priceType: type,
            price: type === "FIXED" ? parseFloat(price) : undefined,
            percent: type === "PERCENT" ? parseFloat(percent) : undefined,
            startsAt: startsAt || null,
            endsAt: endsAt || null,
          }),
      });
      setPrice("");
      setPercent("");
      setQty(String(q + 1));
      await load();
      onSaved();
    } finally {
      setBusy(false);
    }
  }

  async function removeOffer(id: string) {
    await fetch(`${API}/products/offers/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    await load();
    onSaved();
  }

  function computeTotal(o: Offer) {
    const normal = basePrice * o.quantity;
    if (o.priceType === "PERCENT") {
      return normal * (1 - Number(o.percent ?? 0) / 100);
    }
    return Number(o.price ?? 0);
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-foreground/30 backdrop-blur-[2px]">
      <div className="flex max-h-[92vh] w-full max-w-md flex-col rounded-xl border border-border bg-surface shadow-2xl">
        <div className="flex items-start justify-between border-b border-border px-5 py-4">
          <div className="flex items-center gap-3">
            {product.imageUrl ? (
              <img src={product.imageUrl} alt="" className="h-11 w-11 rounded-lg object-cover border border-border" />
            ) : (
              <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-surface-sunken border border-border">
                <Package className="h-5 w-5 text-muted-light" />
              </div>
            )}
            <div>
              <p className="text-sm font-semibold">{product.name}</p>
              <p className="font-mono text-[11px] text-muted">
                {product.sku} · {basePrice.toFixed(3)} TND
              </p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-md p-1 hover:bg-surface-sunken">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {basePrice === 0 && (
            <div className="rounded-lg bg-status-processing-bg px-3 py-2.5 text-[11px] text-status-processing">
              Ce produit n'a pas de prix de vente défini. Renseignez-le d'abord dans
              la fiche produit pour calculer les économies.
            </div>
          )}

          {loading ? (
            <p className="py-8 text-center text-xs text-muted">Chargement...</p>
          ) : offers.length > 0 ? (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                Paliers actifs
              </p>
              {offers.map((o) => {
                const normal = basePrice * o.quantity;
                const offerTotal = computeTotal(o);
                const saving = normal - offerTotal;

                return (
                  <div key={o.id} className="flex items-center gap-3 rounded-lg border border-border px-3 py-2.5">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-xs font-bold text-primary">
                      ×{o.quantity}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold">
                        {offerTotal.toFixed(3)} TND
                        {basePrice > 0 && (
                          <span className="ml-1.5 text-xs font-normal text-muted line-through">
                            {normal.toFixed(3)}
                          </span>
                        )}
                      </p>
                      <p className="text-[11px] text-status-delivered">
                        {o.priceType === "PERCENT"
                          ? `Remise ${Number(o.percent)}%`
                          : "Prix fixe"}
                        {basePrice > 0 && ` · économie ${saving.toFixed(3)} TND`}
                      </p>
                      {((o as any).startsAt || (o as any).endsAt) && (
                        <p className="text-[10px] text-muted">
                          {(o as any).startsAt && `du ${new Date((o as any).startsAt).toLocaleDateString("fr-FR")}`}
                          {(o as any).endsAt && ` au ${new Date((o as any).endsAt).toLocaleDateString("fr-FR")}`}
                        </p>
                      )}
                    </div>
                    <button
                      onClick={() => removeOffer(o.id)}
                      className="text-muted hover:text-status-cancelled"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="py-4 text-center text-xs text-muted">
              Aucun palier défini pour ce produit
            </p>
          )}

          <div className="rounded-lg border border-border p-3 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">
              Ajouter un palier
            </p>

            <div className="flex gap-2">
              <div>
                <label className="mb-1 block text-[11px] text-muted">Quantité</label>
                <Input
                  type="number"
                  value={qty}
                  onChange={(e) => setQty(e.target.value)}
                  min={2}
                  className="h-8 w-20 text-xs"
                />
              </div>
              <div className="flex-1">
                <label className="mb-1 block text-[11px] text-muted">Type de prix</label>
                <div className="flex h-8 rounded-md border border-border overflow-hidden">
                  {[
                    { key: "FIXED", label: "Prix fixe" },
                    { key: "PERCENT", label: "Remise %" },
                  ].map((t) => (
                    <button
                      key={t.key}
                      onClick={() => setType(t.key as any)}
                      className={cn(
                        "flex-1 text-xs font-medium transition-colors",
                        type === t.key
                          ? "bg-primary text-white"
                          : "bg-surface text-muted hover:bg-surface-sunken"
                      )}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {type === "FIXED" ? (
              <div>
                <label className="mb-1 block text-[11px] text-muted">
                  Prix total pour {qty} unités
                </label>
                <Input
                  type="number"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder={basePrice > 0 ? `normal: ${(basePrice * parseInt(qty || "2")).toFixed(3)}` : "ex: 95.000"}
                  step="0.001"
                  className="h-8 text-xs"
                />
              </div>
            ) : (
              <div>
                <label className="mb-1 block text-[11px] text-muted">
                  Remise en % sur le prix normal
                </label>
                <Input
                  type="number"
                  value={percent}
                  onChange={(e) => setPercent(e.target.value)}
                  placeholder="ex: 15"
                  min={0}
                  max={100}
                  className="h-8 text-xs"
                />
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="mb-1 block text-[11px] text-muted">Valide à partir du</label>
                <Input
                  type="date"
                  value={startsAt}
                  onChange={(e) => setStartsAt(e.target.value)}
                  className="h-8 text-xs"
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] text-muted">Jusqu'au</label>
                <Input
                  type="date"
                  value={endsAt}
                  onChange={(e) => setEndsAt(e.target.value)}
                  className="h-8 text-xs"
                />
              </div>
            </div>
            <p className="text-[10px] text-muted">
              Laisser vide pour appliquer sans limite de date
            </p>
            <Button
              size="sm"
              className="w-full"
              disabled={busy || (type === "FIXED" ? !price : !percent)}
              onClick={addOffer}
            >
              <Plus className="h-3.5 w-3.5" />
              {busy ? "Ajout..." : "Ajouter le palier"}
            </Button>
          </div>
        </div>

        <div className="border-t border-border px-5 py-4">
          <Button variant="secondary" className="w-full" onClick={onClose}>
            Fermer
          </Button>
        </div>
      </div>
    </div>
  );
}

function OffersContent() {
  const { canAccessStore } = useAuth();
  const { stores } = useStores();
  const [selectedStoreIds, setSelectedStoreIds] = useState<string[]>([]);
  const [activeStore, setActiveStore] = useState<string>("");
  const [products, setProducts] = useState<any[]>([]);
  const [offersMap, setOffersMap] = useState<Record<string, Offer[]>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [openProduct, setOpenProduct] = useState<any>(null);
  const [syncing, setSyncing] = useState(false);

  const accessibleStores = stores.filter((s) => canAccessStore(s.id));

  useEffect(() => {
    if (stores.length > 0) {
      if (selectedStoreIds.length === 0) setSelectedStoreIds(stores.map((s) => s.id));
      if (!activeStore) setActiveStore(stores[0].id);
    }
  }, [stores]);

  const fetchData = useCallback(async () => {
    if (!activeStore) return;
    setLoading(true);
    try {
      const res = await fetch(`${API}/products?storeIds=${activeStore}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const list = await res.json();
      const items = Array.isArray(list) ? list : [];
      setProducts(items);

      // Load offers for all products in parallel
      const map: Record<string, Offer[]> = {};
      await Promise.all(
        items.map(async (p: any) => {
          try {
            const r = await fetch(`${API}/products/${p.id}/offers`, {
              headers: { Authorization: `Bearer ${getToken()}` },
            });
            const o = await r.json();
            if (Array.isArray(o) && o.length > 0) map[p.id] = o;
          } catch {}
        })
      );
      setOffersMap(map);
    } catch {
      setProducts([]);
    } finally {
      setLoading(false);
    }
  }, [activeStore]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);
  async function syncEasySell() {
    if (!activeStore) return;
    setSyncing(true);
    try {
      const res = await fetch(`${API}/products/sync-easysell/${activeStore}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${getToken()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (data.ok) {
        alert(`${data.created} offres synchronisées depuis EasySell.`);
        fetchData();
      } else {
        alert(data.error ?? "Échec de la synchronisation");
      }
    } finally {
      setSyncing(false);
    }
  }
  const filtered = products.filter((p) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q);
  });

  const withOffers = filtered.filter((p) => offersMap[p.id]?.length > 0);
  const withoutOffers = filtered.filter((p) => !offersMap[p.id]?.length);

  function formatOffer(o: Offer, basePrice: number) {
    if (o.priceType === "PERCENT") return `×${o.quantity} → -${Number(o.percent)}%`;
    return `×${o.quantity} → ${Number(o.price).toFixed(3)}`;
  }

  return (
    <div className="flex h-screen bg-background">
      <Sidebar
        stores={accessibleStores}
        selectedStoreIds={selectedStoreIds}
        onChangeSelectedStores={setSelectedStoreIds}
      />

      <div className="flex min-w-0 max-w-full flex-1 flex-col overflow-x-hidden pt-14 md:pt-0">
      <header className="flex min-h-14 w-full max-w-full shrink-0 flex-wrap items-center justify-between gap-2 overflow-hidden border-b border-border bg-surface px-3 py-2 md:h-14 md:flex-nowrap md:px-5 md:py-0">
          <div>
            <h1 className="text-base font-semibold">Offres quantité</h1>
            <p className="text-xs text-muted">Prix dégressifs par produit</p>
          </div>
          <Button size="sm" disabled={syncing} onClick={syncEasySell}>
            <RefreshCw className={cn("h-3.5 w-3.5", syncing && "animate-spin")} />
            {syncing ? "Synchronisation..." : "Synchroniser depuis EasySell"}
          </Button>
        </header>

        {/* Store tabs */}
        <div className="flex gap-1 border-b border-border bg-surface px-5 py-2">
          {accessibleStores.map((s) => {
            const count = products.filter(
              (p) => p.storeId === s.id && offersMap[p.id]?.length > 0
            ).length;
            return (
              <button
                key={s.id}
                onClick={() => setActiveStore(s.id)}
                className={cn(
                  "flex shrink-0 items-center gap-1 rounded px-2 py-1 text-[10px] font-medium transition-colors md:gap-1.5 md:rounded-md md:px-3 md:py-1.5 md:text-xs",
                  activeStore === s.id
                    ? "bg-primary text-white"
                    : "text-muted hover:bg-surface-sunken"
                )}
              >
                {s.name}
                {activeStore === s.id && withOffers.length > 0 && (
                  <span className="rounded-full bg-white/25 px-1.5 py-0.5 text-[10px]">
                    {withOffers.length}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Search */}
        <div className="border-b border-border bg-surface px-5 py-3">
          <div className="relative w-72">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-light" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher un produit..."
              className="pl-8"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {loading ? (
            <p className="py-16 text-center text-sm text-muted">Chargement...</p>
          ) : (
            <>
              {/* With offers */}
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
                  Produits avec offres ({withOffers.length})
                </p>

                {withOffers.length === 0 ? (
                  <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-12">
                    <Tag className="h-7 w-7 text-muted-light" />
                    <p className="mt-2 text-sm font-medium">Aucune offre pour ce magasin</p>
                    <p className="mt-1 text-xs text-muted">
                      Choisissez un produit ci-dessous pour créer un palier.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {withOffers.map((p) => (
                      <div
                        key={p.id}
                        onClick={() => setOpenProduct(p)}
                        className="group flex cursor-pointer items-center gap-3 rounded-xl border border-border bg-surface p-4 transition-colors hover:border-primary"
                      >
                        {p.imageUrl ? (
                          <img src={p.imageUrl} alt="" className="h-11 w-11 shrink-0 rounded-lg object-cover border border-border" />
                        ) : (
                          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-surface-sunken border border-border">
                            <Package className="h-4 w-4 text-muted-light" />
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{p.name}</p>
                          <p className="font-mono text-[11px] text-muted">
                            {p.sku} · {Number(p.sellPrice ?? 0).toFixed(3)} TND
                          </p>
                          <div className="mt-1.5 flex flex-wrap gap-1.5">
                            {offersMap[p.id].map((o) => (
                              <span
                                key={o.id}
                                className="rounded bg-primary-soft px-2 py-0.5 font-mono text-[10px] font-medium text-primary"
                              >
                                {formatOffer(o, Number(p.sellPrice ?? 0))}
                              </span>
                            ))}
                          </div>
                        </div>
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border text-muted transition-colors group-hover:border-primary group-hover:bg-primary-soft group-hover:text-primary">
                          <Settings2 className="h-3.5 w-3.5" />
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Without offers */}
              <div>
                <button
                  onClick={() => setShowAll((v) => !v)}
                  className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted hover:text-foreground"
                >
                  Produits sans offre ({withoutOffers.length})
                  {showAll ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                </button>

                {showAll && (
                  <div className="grid grid-cols-2 gap-2">
                    {withoutOffers.map((p) => (
                      <div
                        key={p.id}
                        onClick={() => setOpenProduct(p)}
                        className="group flex cursor-pointer items-center gap-2.5 rounded-lg border border-border bg-surface px-3 py-2.5 transition-colors hover:border-primary"
                      >
                        {p.imageUrl ? (
                          <img src={p.imageUrl} alt="" className="h-8 w-8 shrink-0 rounded object-cover" />
                        ) : (
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-surface-sunken">
                            <Package className="h-3.5 w-3.5 text-muted-light" />
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-medium">{p.name}</p>
                          <p className="font-mono text-[10px] text-muted">
                            {Number(p.sellPrice ?? 0).toFixed(3)} TND
                          </p>
                        </div>
                        <Plus className="h-3.5 w-3.5 shrink-0 text-muted group-hover:text-primary" />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {openProduct && (
        <OfferModal
          product={openProduct}
          onClose={() => setOpenProduct(null)}
          onSaved={fetchData}
        />
      )}
    </div>
  );
}

export default function OffersPage() {
  return (
    <RouteGuard>
      <OffersContent />
    </RouteGuard>
  );
}