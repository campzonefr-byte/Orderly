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
  Plus, X, Package, Trash2, Settings2, ArrowRight, Layers,RefreshCw,
} from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api";

function getToken() {
  return window.localStorage.getItem("orderly_token");
}

function UpsellModal({
  stores,
  upsell,
  onClose,
  onSaved,
}: {
  stores: { id: string; name: string }[];
  upsell?: any;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [storeId, setStoreId] = useState(upsell?.storeId ?? stores[0]?.id ?? "");
  const [name, setName] = useState(upsell?.name ?? "");
  const [triggerProductId, setTriggerProductId] = useState(upsell?.triggerProductId ?? "");
  const [items, setItems] = useState<{ productId: string; price: string }[]>(
    upsell?.items?.map((i: any) => ({
      productId: i.productId,
      price: String(i.price),
    })) ?? [{ productId: "", price: "" }]
  );
  const [products, setProducts] = useState<any[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [startsAt, setStartsAt] = useState(
    upsell?.startsAt ? upsell.startsAt.slice(0, 10) : ""
  );
  const [endsAt, setEndsAt] = useState(
    upsell?.endsAt ? upsell.endsAt.slice(0, 10) : ""
  );
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!storeId) return;
    setLoadingProducts(true);
    fetch(`${API}/products?storeIds=${storeId}`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    })
      .then((r) => r.json())
      .then((d) => setProducts(Array.isArray(d) ? d : []))
      .catch(() => setProducts([]))
      .finally(() => setLoadingProducts(false));
  }, [storeId]);

  async function save() {
    const validItems = items
      .filter((i) => i.productId && i.price)
      .map((i) => ({ productId: i.productId, price: parseFloat(i.price) }));

    if (!name.trim() || !triggerProductId || validItems.length === 0) return;

    setLoading(true);
    try {
        const body = {
            storeId,
            name: name.trim(),
            triggerProductId,
            items: validItems,
            startsAt: startsAt || null,
            endsAt: endsAt || null,
          };

      if (upsell) {
        await fetch(`${API}/upsells/${upsell.id}`, {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${getToken()}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name: body.name,
            items: body.items,
            startsAt: body.startsAt,
            endsAt: body.endsAt,
          }),
        });
      } else {
        await fetch(`${API}/upsells`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${getToken()}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        });
      }
      onSaved();
      onClose();
    } finally {
      setLoading(false);
    }
  }

  const availableProducts = products.filter((p) => p.id !== triggerProductId);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-foreground/30 backdrop-blur-[2px]">
      <div className="flex max-h-[92vh] w-full max-w-lg flex-col rounded-xl border border-border bg-surface shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-sm font-semibold">
            {upsell ? "Modifier l'upsell" : "Nouvel upsell"}
          </h2>
          <button onClick={onClose} className="rounded-md p-1 hover:bg-surface-sunken">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div className="rounded-lg bg-primary-soft px-3 py-2.5 text-[11px] text-primary">
            <p className="font-semibold">Comment ça marche</p>
            <p className="mt-0.5">
              Quand le produit déclencheur est dans la commande, les produits associés
              prennent automatiquement leur prix spécial.
            </p>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-muted">Magasin</label>
            <select
              value={storeId}
              onChange={(e) => setStoreId(e.target.value)}
              disabled={!!upsell}
              className="h-9 w-full rounded-md border border-border bg-surface px-2 text-sm focus-visible:outline-none disabled:opacity-50"
            >
              {stores.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-muted">Nom de l'upsell</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="ex: Pack Hydratation"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-muted">
              Produit déclencheur <span className="text-status-cancelled">*</span>
            </label>
            {loadingProducts ? (
              <p className="text-xs text-muted">Chargement...</p>
            ) : (
              <select
                value={triggerProductId}
                onChange={(e) => setTriggerProductId(e.target.value)}
                disabled={!!upsell}
                className="h-9 w-full rounded-md border border-border bg-surface px-2 text-sm focus-visible:outline-none disabled:opacity-50"
              >
                <option value="">Choisir un produit...</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({Number(p.sellPrice ?? 0).toFixed(3)} TND)
                  </option>
                ))}
              </select>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">Valide à partir du</label>
              <Input
                type="date"
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">Jusqu'au</label>
              <Input
                type="date"
                value={endsAt}
                onChange={(e) => setEndsAt(e.target.value)}
              />
            </div>
          </div>
          <p className="-mt-2 text-[11px] text-muted">
            Laisser vide pour appliquer sans limite de date
          </p>
          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className="text-xs font-medium text-muted">
                Produits en upsell <span className="text-status-cancelled">*</span>
              </label>
              <button
                onClick={() => setItems((p) => [...p, { productId: "", price: "" }])}
                className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              >
                <Plus className="h-3 w-3" /> Ajouter
              </button>
            </div>

            <div className="space-y-2">
              {items.map((item, idx) => {
                const prod = products.find((p) => p.id === item.productId);
                const normalPrice = Number(prod?.sellPrice ?? 0);
                const specialPrice = parseFloat(item.price) || 0;
                const saving = normalPrice - specialPrice;

                return (
                  <div key={idx} className="rounded-lg border border-border p-2.5 space-y-2">
                    <div className="flex items-center gap-2">
                      <select
                        value={item.productId}
                        onChange={(e) =>
                          setItems((prev) =>
                            prev.map((it, i) =>
                              i === idx ? { ...it, productId: e.target.value } : it
                            )
                          )
                        }
                        className="h-8 flex-1 rounded-md border border-border bg-surface px-2 text-xs focus-visible:outline-none"
                      >
                        <option value="">Choisir un produit...</option>
                        {availableProducts.map((p) => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                      </select>
                      {items.length > 1 && (
                        <button
                          onClick={() => setItems((prev) => prev.filter((_, i) => i !== idx))}
                          className="text-muted hover:text-status-cancelled"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        value={item.price}
                        onChange={(e) =>
                          setItems((prev) =>
                            prev.map((it, i) =>
                              i === idx ? { ...it, price: e.target.value } : it
                            )
                          )
                        }
                        placeholder={normalPrice > 0 ? `normal: ${normalPrice.toFixed(3)}` : "Prix spécial"}
                        step="0.001"
                        className="h-8 flex-1 text-xs"
                      />
                      {saving > 0 && (
                        <span className="shrink-0 rounded bg-status-delivered-bg px-2 py-1 text-[10px] font-medium text-status-delivered">
                          -{saving.toFixed(3)} TND
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="flex gap-2 border-t border-border px-5 py-4">
          <Button variant="secondary" className="flex-1" onClick={onClose}>Annuler</Button>
          <Button
            className="flex-1"
            disabled={loading || !name.trim() || !triggerProductId}
            onClick={save}
          >
            {loading ? "Enregistrement..." : "Enregistrer"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function UpsellsContent() {
  const { canAccessStore } = useAuth();
  const { stores } = useStores();
  const [selectedStoreIds, setSelectedStoreIds] = useState<string[]>([]);
  const [upsells, setUpsells] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editUpsell, setEditUpsell] = useState<any>(null);
  const [syncing, setSyncing] = useState(false);

  async function syncEasySell() {
    const storeId = selectedStoreIds[0];
    if (!storeId) return;
    setSyncing(true);
    try {
      const res = await fetch(`${API}/products/sync-easysell-bumps/${storeId}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${getToken()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (data.ok) {
        alert(`${data.created} upsells synchronisés depuis EasySell.`);
        fetchUpsells();
      } else {
        alert(data.error ?? "Échec de la synchronisation");
      }
    } finally {
      setSyncing(false);
    }
  }

  const accessibleStores = stores.filter((s) => canAccessStore(s.id));

  useEffect(() => {
    if (stores.length > 0 && selectedStoreIds.length === 0) {
      setSelectedStoreIds(stores.map((s) => s.id));
    }
  }, [stores]);

  const fetchUpsells = useCallback(async () => {
    if (selectedStoreIds.length === 0) return;
    setLoading(true);
    try {
      const res = await fetch(
        `${API}/upsells?storeIds=${selectedStoreIds.join(",")}`,
        { headers: { Authorization: `Bearer ${getToken()}` } }
      );
      const data = await res.json();
      setUpsells(Array.isArray(data) ? data : []);
    } catch {
      setUpsells([]);
    } finally {
      setLoading(false);
    }
  }, [selectedStoreIds]);

  useEffect(() => {
    fetchUpsells();
  }, [fetchUpsells]);

  async function toggle(u: any) {
    await fetch(`${API}/upsells/${u.id}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${getToken()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ isActive: !u.isActive }),
    });
    fetchUpsells();
  }

  async function remove(id: string) {
    if (!window.confirm("Supprimer cet upsell ?")) return;
    await fetch(`${API}/upsells/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    fetchUpsells();
  }

  return (
    <div className="flex h-screen bg-background">
      <Sidebar
        stores={accessibleStores}
        selectedStoreIds={selectedStoreIds}
        onChangeSelectedStores={setSelectedStoreIds}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-surface px-5">
          <div>
            <h1 className="text-base font-semibold">Upsells</h1>
            <p className="text-xs text-muted">Prix spéciaux quand deux produits sont achetés ensemble</p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" disabled={syncing} onClick={syncEasySell}>
              <RefreshCw className={cn("h-3.5 w-3.5", syncing && "animate-spin")} />
              {syncing ? "Synchronisation..." : "Synchroniser EasySell"}
            </Button>
            <Button size="sm" onClick={() => { setEditUpsell(null); setShowModal(true); }}>
              <Plus className="h-3.5 w-3.5" />
              Nouvel upsell
            </Button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-5">
          {loading ? (
            <p className="py-16 text-center text-sm text-muted">Chargement...</p>
          ) : upsells.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24">
              <Layers className="h-8 w-8 text-muted-light" />
              <p className="mt-2 text-sm font-medium">Aucun upsell</p>
              <p className="mt-1 text-center text-xs text-muted max-w-sm">
                Créez un upsell pour qu'un produit prenne un prix spécial
                quand il est acheté avec un autre.
              </p>
              <Button size="sm" className="mt-4" onClick={() => { setEditUpsell(null); setShowModal(true); }}>
                <Plus className="h-3.5 w-3.5" />
                Créer un upsell
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {upsells.map((u) => (
                <div
                  key={u.id}
                  className={cn(
                    "rounded-xl border bg-surface p-4",
                    u.isActive ? "border-border" : "border-border opacity-60"
                  )}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm font-semibold">{u.name}</p>
                      <p className="text-xs text-muted">{u.store?.name}</p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className={cn(
                        "rounded-full px-2 py-0.5 text-[10px] font-medium",
                        u.isActive ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"
                      )}>
                        {u.isActive ? "Actif" : "Inactif"}
                      </span>
                      <button
                        onClick={() => toggle(u)}
                        className="rounded p-1 text-muted hover:bg-surface-sunken"
                        title={u.isActive ? "Désactiver" : "Activer"}
                      >
                        <Settings2 className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => { setEditUpsell(u); setShowModal(true); }}
                        className="rounded p-1 text-muted hover:bg-surface-sunken"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => remove(u.id)}
                        className="rounded p-1 text-muted hover:bg-status-cancelled-bg hover:text-status-cancelled"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="mt-3 flex items-center gap-3">
                    {/* Trigger */}
                    <div className="flex items-center gap-2 rounded-lg border-2 border-primary bg-primary-soft px-3 py-2">
                      {u.triggerProduct?.imageUrl ? (
                        <img src={u.triggerProduct.imageUrl} alt="" className="h-8 w-8 rounded object-cover" />
                      ) : (
                        <div className="flex h-8 w-8 items-center justify-center rounded bg-white">
                          <Package className="h-3.5 w-3.5 text-primary" />
                        </div>
                      )}
                      <div>
                        <p className="text-xs font-semibold text-primary">{u.triggerProduct?.name}</p>
                        <p className="text-[10px] text-primary/70">déclencheur</p>
                      </div>
                    </div>

                    <ArrowRight className="h-4 w-4 shrink-0 text-muted" />

                    {/* Items */}
                    <div className="flex flex-1 flex-wrap gap-2">
                      {u.items?.map((it: any) => {
                        const normal = Number(it.product?.sellPrice ?? 0);
                        const special = Number(it.price);
                        return (
                          <div
                            key={it.id}
                            className="flex items-center gap-2 rounded-lg border border-border px-3 py-2"
                          >
                            {it.product?.imageUrl ? (
                              <img src={it.product.imageUrl} alt="" className="h-8 w-8 rounded object-cover" />
                            ) : (
                              <div className="flex h-8 w-8 items-center justify-center rounded bg-surface-sunken">
                                <Package className="h-3.5 w-3.5 text-muted-light" />
                              </div>
                            )}
                            <div>
                              <p className="text-xs font-medium">{it.product?.name}</p>
                              <p className="text-[10px]">
                                <span className="font-mono font-bold text-status-delivered">
                                  {special.toFixed(3)}
                                </span>
                                {normal > special && (
                                  <span className="ml-1 font-mono text-muted line-through">
                                    {normal.toFixed(3)}
                                  </span>
                                )}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {showModal && (
        <UpsellModal
          stores={accessibleStores}
          upsell={editUpsell}
          onClose={() => { setShowModal(false); setEditUpsell(null); }}
          onSaved={fetchUpsells}
        />
      )}
    </div>
  );
}

export default function UpsellsPage() {
  return (
    <RouteGuard>
      <UpsellsContent />
    </RouteGuard>
  );
}