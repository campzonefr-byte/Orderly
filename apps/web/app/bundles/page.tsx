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
  Plus, X, Package, Trash2, Settings2,
  ChevronDown, ChevronUp, BarChart3,
} from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api";

function getToken() {
  return window.localStorage.getItem("orderly_token");
}

function CreateBundleModal({
  stores,
  onClose,
  onCreated,
}: {
  stores: { id: string; name: string }[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [storeId, setStoreId] = useState(stores[0]?.id ?? "");
  const [products, setProducts] = useState<any[]>([]);
  const [bundleProductId, setBundleProductId] = useState("");
  const [name, setName] = useState("");
  const [components, setComponents] = useState<{ productId: string; quantity: number }[]>([
    { productId: "", quantity: 1 },
  ]);
  const [loading, setLoading] = useState(false);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!storeId) return;
    setLoadingProducts(true);
    fetch(`${API}/bundles/products/${storeId}`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    })
      .then((r) => r.json())
      .then((d) => setProducts(Array.isArray(d) ? d : []))
      .catch(() => setProducts([]))
      .finally(() => setLoadingProducts(false));
  }, [storeId]);

  function updateComponent(idx: number, patch: any) {
    setComponents((prev) => prev.map((c, i) => (i === idx ? { ...c, ...patch } : c)));
  }

  async function create() {
    if (!name.trim() || !bundleProductId || components.some((c) => !c.productId)) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${API}/bundles`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${getToken()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ storeId, productId: bundleProductId, name, components }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message ?? "Erreur");
      onCreated();
      onClose();
    } catch (e: any) {
      setError(e?.message ?? "Erreur");
    } finally {
      setLoading(false);
    }
  }

  const nonBundleProducts = products.filter((p) => !p.isBundle);
  const componentProducts = products.filter(
    (p) => !p.isBundle && p.id !== bundleProductId
  );

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-foreground/30 backdrop-blur-[2px]">
      <div className="flex max-h-[92vh] w-full max-w-lg flex-col rounded-xl border border-border bg-surface shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-sm font-semibold">Créer un bundle</h2>
          <button onClick={onClose} className="rounded-md p-1 hover:bg-surface-sunken">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">Magasin</label>
            <select
              value={storeId}
              onChange={(e) => setStoreId(e.target.value)}
              className="h-9 w-full rounded-md border border-border bg-surface px-2 text-sm focus-visible:outline-none"
            >
              {stores.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-muted">
              Produit bundle <span className="text-status-cancelled">*</span>
            </label>
            <p className="mb-1.5 text-[11px] text-muted">
              Le produit Shopify/Converty qui représente ce bundle
            </p>
            {loadingProducts ? (
              <p className="text-xs text-muted">Chargement...</p>
            ) : (
              <select
                value={bundleProductId}
                onChange={(e) => {
                  setBundleProductId(e.target.value);
                  const p = products.find((x) => x.id === e.target.value);
                  if (p) setName(p.name);
                }}
                className="h-9 w-full rounded-md border border-border bg-surface px-2 text-sm focus-visible:outline-none"
              >
                <option value="">Choisir un produit...</option>
                {nonBundleProducts.map((p) => (
                  <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>
                ))}
              </select>
            )}
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-muted">Nom du bundle</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="ex: Pack Glow Complet" />
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className="text-xs font-medium text-muted">
                Composants <span className="text-status-cancelled">*</span>
              </label>
              <button
                onClick={() => setComponents((p) => [...p, { productId: "", quantity: 1 }])}
                className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              >
                <Plus className="h-3 w-3" /> Ajouter
              </button>
            </div>
            <div className="space-y-2">
              {components.map((c, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <select
                    value={c.productId}
                    onChange={(e) => updateComponent(idx, { productId: e.target.value })}
                    className="h-8 flex-1 rounded-md border border-border bg-surface px-2 text-xs focus-visible:outline-none"
                  >
                    <option value="">Choisir un composant...</option>
                    {componentProducts.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} (stock: {p.quantityAvailable})
                      </option>
                    ))}
                  </select>
                  <Input
                    type="number"
                    value={c.quantity}
                    onChange={(e) => updateComponent(idx, { quantity: parseInt(e.target.value) || 1 })}
                    min={1}
                    className="h-8 w-16 text-xs"
                  />
                  {components.length > 1 && (
                    <button
                      onClick={() => setComponents((p) => p.filter((_, i) => i !== idx))}
                      className="text-muted hover:text-status-cancelled"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {error && (
            <p className="rounded-md bg-status-cancelled-bg px-3 py-2 text-xs text-status-cancelled">
              {error}
            </p>
          )}
        </div>

        <div className="flex gap-2 border-t border-border px-5 py-4">
          <Button variant="secondary" className="flex-1" onClick={onClose}>Annuler</Button>
          <Button
            className="flex-1"
            disabled={loading || !name.trim() || !bundleProductId || components.some((c) => !c.productId)}
            onClick={create}
          >
            {loading ? "Création..." : "Créer le bundle"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function BundleCard({
  bundle,
  allProducts,
  onRefresh,
}: {
  bundle: any;
  allProducts: any[];
  onRefresh: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);

  async function toggle() {
    setBusy(true);
    try {
      await fetch(`${API}/bundles/${bundle.id}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${getToken()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ isActive: !bundle.isActive }),
      });
      onRefresh();
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!window.confirm(`Supprimer le bundle "${bundle.name}" ?`)) return;
    await fetch(`${API}/bundles/${bundle.id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    onRefresh();
  }

  return (
    <div className={cn(
      "rounded-xl border bg-surface",
      bundle.isActive ? "border-border" : "border-border opacity-60"
    )}>
      <div className="flex items-start gap-3 p-4">
        {bundle.product?.imageUrl ? (
          <img src={bundle.product.imageUrl} alt="" className="h-12 w-12 shrink-0 rounded-lg object-cover border border-border" />
        ) : (
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-surface-sunken border border-border">
            <Package className="h-5 w-5 text-muted-light" />
          </div>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-sm font-semibold">{bundle.name}</p>
              <p className="font-mono text-[11px] text-muted">{bundle.sku ?? bundle.product?.sku}</p>
              <p className="text-[11px] text-muted">{bundle.storeName}</p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <span className={cn(
                "rounded-full px-2 py-0.5 text-[10px] font-medium",
                bundle.isActive ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"
              )}>
                {bundle.isActive ? "Actif" : "Inactif"}
              </span>
              <button onClick={toggle} disabled={busy} className="rounded p-1 text-muted hover:bg-surface-sunken">
                <Settings2 className="h-3.5 w-3.5" />
              </button>
              <button onClick={remove} className="rounded p-1 text-muted hover:bg-status-cancelled-bg hover:text-status-cancelled">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* Stats */}
          <div className="mt-2 flex gap-4 text-[11px]">
            <div>
              <span className="text-muted">Stock calc. </span>
              <span className={cn(
                "font-bold font-mono",
                bundle.computedStock <= 0 ? "text-status-cancelled" :
                bundle.computedStock <= 5 ? "text-status-processing" :
                "text-status-delivered"
              )}>
                {bundle.computedStock}
              </span>
            </div>
            <div>
              <span className="text-muted">Vendus 30j </span>
              <span className="font-bold">{bundle.stats.sold30}</span>
            </div>
            <div>
              <span className="text-muted">CA </span>
              <span className="font-bold font-mono">{bundle.stats.revenue} TND</span>
            </div>
            <div>
              <span className="text-muted">Retours </span>
              <span className="font-bold">{bundle.stats.returnRate}%</span>
            </div>
          </div>
        </div>
      </div>

      {/* Components */}
      <div className="border-t border-border">
        <button
          onClick={() => setExpanded((v) => !v)}
          className="flex w-full items-center justify-between px-4 py-2 text-xs font-medium text-muted hover:bg-surface-sunken"
        >
          <span>{bundle.components.length} composant{bundle.components.length !== 1 ? "s" : ""}</span>
          {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </button>

        {expanded && (
          <div className="divide-y divide-border border-t border-border">
            {bundle.components.map((c: any) => (
              <div key={c.id} className="flex items-center gap-3 px-4 py-2.5">
                {c.product?.imageUrl ? (
                  <img src={c.product.imageUrl} alt="" className="h-8 w-8 shrink-0 rounded object-cover" />
                ) : (
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-surface-sunken">
                    <Package className="h-3.5 w-3.5 text-muted-light" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium">{c.product?.name}</p>
                  <p className="font-mono text-[10px] text-muted">{c.product?.sku}</p>
                </div>
                <div className="text-right text-xs">
                  <p className="font-semibold">× {c.quantity}</p>
                  <p className={cn(
                    "font-mono text-[10px]",
                    c.product?.quantityAvailable <= 0 ? "text-status-cancelled" :
                    c.product?.quantityAvailable <= 5 ? "text-status-processing" :
                    "text-muted"
                  )}>
                    stock: {c.product?.quantityAvailable}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function BundlesContent() {
  const { canAccessStore } = useAuth();
  const { stores } = useStores();
  const [selectedStoreIds, setSelectedStoreIds] = useState<string[]>([]);
  const [bundles, setBundles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  const accessibleStores = stores.filter((s) => canAccessStore(s.id));

  useEffect(() => {
    if (stores.length > 0 && selectedStoreIds.length === 0) {
      setSelectedStoreIds(stores.map((s) => s.id));
    }
  }, [stores]);

  const fetchBundles = useCallback(async () => {
    if (selectedStoreIds.length === 0) return;
    setLoading(true);
    try {
      const res = await fetch(
        `${API}/bundles?storeIds=${selectedStoreIds.join(",")}`,
        { headers: { Authorization: `Bearer ${getToken()}` } }
      );
      const data = await res.json();
      setBundles(Array.isArray(data) ? data : []);
    } catch {
      setBundles([]);
    } finally {
      setLoading(false);
    }
  }, [selectedStoreIds]);

  useEffect(() => {
    fetchBundles();
  }, [fetchBundles]);

  return (
    <div className="flex h-screen bg-background">
      <Sidebar
        stores={accessibleStores}
        selectedStoreIds={selectedStoreIds}
        onChangeSelectedStores={setSelectedStoreIds}
      />

      <div className="flex min-w-0 flex-1 flex-col pt-14 md:pt-0">
        <header className="flex min-h-14 shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border bg-surface px-4 py-2 md:h-14 md:flex-nowrap md:px-5 md:py-0">
          <div>
            <h1 className="text-base font-semibold">Bundles</h1>
            <p className="text-xs text-muted">Produits composés de plusieurs articles</p>
          </div>
          <Button size="sm" onClick={() => setShowCreate(true)}>
            <Plus className="h-3.5 w-3.5" />
            Créer un bundle
          </Button>
        </header>

        {/* Summary */}
        {bundles.length > 0 && (
          <div className="grid grid-cols-4 gap-3 border-b border-border bg-surface p-4">
            <div className="rounded-lg bg-surface-sunken px-3 py-2.5">
              <p className="text-[10px] text-muted">Bundles</p>
              <p className="mt-0.5 text-xl font-bold">{bundles.length}</p>
            </div>
            <div className="rounded-lg bg-status-delivered-bg px-3 py-2.5">
              <p className="text-[10px] text-status-delivered">Actifs</p>
              <p className="mt-0.5 text-xl font-bold text-status-delivered">
                {bundles.filter((b) => b.isActive).length}
              </p>
            </div>
            <div className="rounded-lg bg-primary-soft px-3 py-2.5">
              <p className="text-[10px] text-primary">Vendus 30j</p>
              <p className="mt-0.5 text-xl font-bold text-primary">
                {bundles.reduce((s, b) => s + b.stats.sold30, 0)}
              </p>
            </div>
            <div className="rounded-lg bg-surface-sunken px-3 py-2.5">
              <p className="text-[10px] text-muted">CA 30j</p>
              <p className="mt-0.5 font-mono text-xl font-bold">
                {bundles.reduce((s, b) => s + b.stats.revenue, 0)} TND
              </p>
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-5">
          {loading ? (
            <p className="py-16 text-center text-sm text-muted">Chargement...</p>
          ) : bundles.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24">
              <Package className="h-8 w-8 text-muted-light" />
              <p className="mt-2 text-sm font-medium">Aucun bundle</p>
              <p className="mt-1 text-xs text-muted text-center max-w-sm">
                Créez un bundle pour qu'une commande de ce produit déduise automatiquement
                les stocks de ses composants.
              </p>
              <Button size="sm" className="mt-4" onClick={() => setShowCreate(true)}>
                <Plus className="h-3.5 w-3.5" />
                Créer un bundle
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              {bundles.map((b) => (
                <BundleCard
                  key={b.id}
                  bundle={b}
                  allProducts={[]}
                  onRefresh={fetchBundles}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {showCreate && (
        <CreateBundleModal
          stores={accessibleStores}
          onClose={() => setShowCreate(false)}
          onCreated={fetchBundles}
        />
      )}
    </div>
  );
}

export default function BundlesPage() {
  return (
    <RouteGuard>
      <BundlesContent />
    </RouteGuard>
  );
}