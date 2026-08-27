"use client";

import { useState, useEffect, useCallback } from "react";
import { Sidebar } from "@/components/layout/sidebar";
import { RouteGuard } from "@/components/auth/route-guard";
import { useStores } from "@/lib/stores-context";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ImportProductsModal } from "@/components/products/import-products-modal";
import { cn } from "@/lib/utils";
import {
  Search, Package, Plus, X, Download, AlertTriangle,
  ChevronLeft, ChevronRight, Calendar, Settings2, Bell,
} from "lucide-react";
import { ProductModal } from "@/components/products/product-modal";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api";

function getToken() {
  return window.localStorage.getItem("orderly_token");
}

const PAGE_SIZE = 30;
const [selectedIds, setSelectedIds] = useState<Set<string>>([]);
const STATUS_STYLE: Record<string, string> = {
  OK: "bg-status-delivered-bg text-status-delivered",
  SOON: "bg-status-processing-bg text-status-processing",
  LOW: "bg-status-processing-bg text-status-processing",
  OUT: "bg-status-cancelled-bg text-status-cancelled",
};

const STATUS_LABEL: Record<string, string> = {
  OK: "En stock",
  SOON: "Bientot epuise",
  LOW: "Stock bas",
  OUT: "Rupture",
};

function CreateProductModal({
  stores,
  onClose,
  onCreated,
}: {
  stores: { id: string; name: string }[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [storeId, setStoreId] = useState(stores[0]?.id ?? "");
  const [sku, setSku] = useState("");
  const [name, setName] = useState("");
  const [qty, setQty] = useState("0");
  const [threshold, setThreshold] = useState("5");
  const [cost, setCost] = useState("");
  const [sell, setSell] = useState("");
  const [loading, setLoading] = useState(false);

  async function create() {
    setLoading(true);
    try {
      await fetch(`${API}/products`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${getToken()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          storeId,
          sku: sku.trim(),
          name: name.trim(),
          quantityAvailable: parseInt(qty) || 0,
          lowStockThreshold: parseInt(threshold) || 5,
          costPrice: cost ? parseFloat(cost) : undefined,
          sellPrice: sell ? parseFloat(sell) : undefined,
        }),
      });
      onCreated();
      onClose();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-foreground/30 backdrop-blur-[2px]">
      <div className="w-full max-w-md rounded-xl border border-border bg-surface shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-sm font-semibold">Nouveau produit</h2>
          <button onClick={onClose} className="rounded-md p-1 hover:bg-surface-sunken">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3 p-5">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">Magasin</label>
            <select
              value={storeId}
              onChange={(e) => setStoreId(e.target.value)}
              className="h-9 w-full rounded-md border border-border bg-surface px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              {stores.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="mb-1 block text-xs font-medium text-muted">Nom</label>
              <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
            </div>
            <div className="col-span-2">
              <label className="mb-1 block text-xs font-medium text-muted">SKU</label>
              <Input value={sku} onChange={(e) => setSku(e.target.value)} placeholder="SKU-001" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">Stock initial</label>
              <Input type="number" value={qty} onChange={(e) => setQty(e.target.value)} min={0} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">Seuil alerte</label>
              <Input type="number" value={threshold} onChange={(e) => setThreshold(e.target.value)} min={0} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">Prix achat</label>
              <Input type="number" value={cost} onChange={(e) => setCost(e.target.value)} step="0.001" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">Prix vente</label>
              <Input type="number" value={sell} onChange={(e) => setSell(e.target.value)} step="0.001" />
            </div>
          </div>
        </div>

        <div className="flex gap-2 border-t border-border px-5 py-4">
          <Button variant="secondary" className="flex-1" onClick={onClose}>Annuler</Button>
          <Button
            className="flex-1"
            disabled={loading || !name.trim() || !sku.trim()}
            onClick={create}
          >
            {loading ? "..." : "Creer"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function ProductsContent() {
  const { canAccessStore } = useAuth();
  const { stores } = useStores();
  const [products, setProducts] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "OK" | "SOON" | "LOW" | "OUT" | "DEFECTIVE" | "INACTIVE">("all");
  const [selectedStoreIds, setSelectedStoreIds] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const accessibleStores = stores.filter((s) => canAccessStore(s.id));

  useEffect(() => {
    if (stores.length > 0 && selectedStoreIds.length === 0) {
      setSelectedStoreIds(stores.map((s) => s.id));
    }
  }, [stores]);

  const fetchAll = useCallback(async () => {
    if (selectedStoreIds.length === 0) return;
    setLoading(true);
    try {
      const q = `storeIds=${selectedStoreIds.join(",")}`;
      const [pRes, sRes] = await Promise.all([
        fetch(`${API}/products/all?storeIds=${selectedStoreIds.join(",")}`, { headers: { Authorization: `Bearer ${getToken()}` } }),
        fetch(`${API}/products/summary?${q}`, { headers: { Authorization: `Bearer ${getToken()}` } }),
      ]);
      const p = await pRes.json();
      setProducts(Array.isArray(p) ? p : []);
      setSummary(await sRes.json());
    } catch {
      setProducts([]);
    } finally {
      setLoading(false);
    }
  }, [selectedStoreIds]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const filtered = products.filter((p) => {
    const f = filter as string;
    if (f === "INACTIVE") return !p.isActive;
    if (f === "ACTIVE") return p.isActive;
    if (f === "DEFECTIVE") return p.defectiveQty > 0;
    if (!p.isActive && f !== "all") return false;
    if (f !== "all" && p.status !== f) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!p.name.toLowerCase().includes(q) && !p.sku.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="flex h-screen bg-background">
      <Sidebar
        stores={accessibleStores}
        selectedStoreIds={selectedStoreIds}
        onChangeSelectedStores={setSelectedStoreIds}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-surface px-5">
          <h1 className="text-base font-semibold">Produits & Stock</h1>
          <div className="flex items-center gap-2">
          <Button size="sm" variant="secondary" onClick={() => setShowImport(true)}>
              <Download className="h-3.5 w-3.5" />
              Importer depuis une boutique
            </Button>
            <Button size="sm" onClick={() => setShowCreate(true)}>
              <Plus className="h-3.5 w-3.5" />
              Produit
            </Button>
          </div>
        </header>

        {/* Summary */}
        {summary && (
          <div className="grid grid-cols-6 gap-3 border-b border-border bg-surface p-4">
            <div className="rounded-lg bg-surface-sunken px-3 py-2.5">
              <p className="text-[10px] text-muted">Produits</p>
              <p className="mt-0.5 text-xl font-bold">{summary.total}</p>
            </div>
            <div className="rounded-lg bg-status-delivered-bg px-3 py-2.5">
              <p className="text-[10px] text-status-delivered">En stock</p>
              <p className="mt-0.5 text-xl font-bold text-status-delivered">{summary.ok}</p>
            </div>
            <div className="rounded-lg bg-status-processing-bg px-3 py-2.5">
              <p className="text-[10px] text-status-processing">Bientot epuise</p>
              <p className="mt-0.5 text-xl font-bold text-status-processing">{summary.soon}</p>
            </div>
            <div className="rounded-lg bg-status-processing-bg px-3 py-2.5">
              <p className="text-[10px] text-status-processing">Stock bas</p>
              <p className="mt-0.5 text-xl font-bold text-status-processing">{summary.low}</p>
            </div>
            <div className="rounded-lg bg-status-cancelled-bg px-3 py-2.5">
              <p className="text-[10px] text-status-cancelled">Rupture</p>
              <p className="mt-0.5 text-xl font-bold text-status-cancelled">{summary.out}</p>
            </div>
            <div className="rounded-lg bg-status-refunded-bg px-3 py-2.5">
              <p className="text-[10px] text-status-refunded">Defectueux</p>
              <p className="mt-0.5 text-xl font-bold text-status-refunded">{summary.defective}</p>
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="flex items-center gap-3 border-b border-border bg-surface px-5 py-3">
          <div className="relative w-64">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-light" />
            <Input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="Rechercher nom ou SKU..."
              className="pl-8"
            />
          </div>
          <div className="flex gap-1">
          {[
              { key: "all", label: "Tous", count: products.length },
              { key: "ACTIVE", label: "Actifs", count: products.filter((p) => p.isActive).length },
              { key: "OUT", label: "Rupture", count: summary?.out ?? 0 },
              { key: "LOW", label: "Stock bas", count: summary?.low ?? 0 },
              { key: "SOON", label: "Bientot", count: summary?.soon ?? 0 },
              { key: "OK", label: "OK", count: summary?.ok ?? 0 },
              { key: "DEFECTIVE", label: "Defectueux", count: products.filter((p) => p.defectiveQty > 0).length },
              { key: "INACTIVE", label: "Inactifs", count: products.filter((p) => !p.isActive).length },
            ].map((t) => (
              <button
                key={t.key}
                onClick={() => { setFilter(t.key as any); setPage(1); }}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                  filter === t.key ? "bg-primary-soft text-primary" : "text-muted hover:bg-surface-sunken"
                )}
              >
                {t.label}
                <span className={cn(
                  "rounded-full px-1.5 py-0.5 text-[10px]",
                  filter === t.key ? "bg-primary text-white" : "bg-surface-sunken"
                )}>
                  {t.count}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="border-b border-border bg-surface-sunken px-5 py-1.5">
          <p className="flex items-center gap-1.5 text-[11px] text-muted">
            <Settings2 className="h-3 w-3" />
            Cliquez sur un produit pour ajuster le stock, modifier les seuils et voir les statistiques
          </p>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto">
          {loading ? (
            <p className="py-24 text-center text-sm text-muted">Chargement...</p>
          ) : (
            <table className="w-full border-collapse text-sm">
              <thead className="sticky top-0 z-10 bg-surface">
                <tr className="border-b border-border text-left text-xs font-medium text-muted">
                <th className="px-4 py-2.5 w-10">
                    <input
                      type="checkbox"
                      checked={selectedIds.length === pageItems.length && pageItems.length > 0}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedIds(pageItems.map((p) => p.id));
                        } else {
                          setSelectedIds([]);
                        }
                      }}
                      className="h-4 w-4 accent-primary"
                    />
                  </th>
                  <th className="px-4 py-2.5">Produit</th>
                  <th className="px-4 py-2.5">Magasin</th>
                  <th className="px-4 py-2.5">Disponible</th>
                  <th className="px-4 py-2.5">Defectueux</th>
                  <th className="px-4 py-2.5">Seuil alerte</th>
                  <th className="px-4 py-2.5">Vendus 30j</th>
                  <th className="px-4 py-2.5">Rupture dans</th>
                  <th className="px-4 py-2.5">Stock</th>
                  <th className="px-4 py-2.5">Catalogue</th>
                  <th className="px-4 py-2.5"></th>
                </tr>
              </thead>
              <tbody>
                {pageItems.map((p) => (
                  <tr
                    key={p.id}
                    onClick={() => setOpenId(p.id)}
                                        className="group cursor-pointer border-b border-border transition-colors hover:bg-surface-sunken"
                  >
                                                           <td className="px-4 py-3 w-10" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(p.id)}
                        onChange={(e) => {
                          const next = [...selectedIds];
                          if (e.target.checked) {
                            next.push(p.id);
                          } else {
                            const idx = next.indexOf(p.id);
                            if (idx > -1) next.splice(idx, 1);
                          }
                          setSelectedIds(next);
                        }}
                        className="h-4 w-4 accent-primary"
                      />
                    </td>
                                       <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        {p.imageUrl ? (
                          <img
                            src={p.imageUrl}
                            alt=""
                            className="h-10 w-10 shrink-0 rounded-md border border-border object-cover"
                          />
                        ) : (
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-border bg-surface-sunken">
                            <Package className="h-4 w-4 text-muted-light" />
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="truncate max-w-[200px] text-sm font-medium">{p.name}</p>
                          <p className="font-mono text-[11px] text-muted">{p.sku}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted">{p.storeName}</td>
                    <td className="px-4 py-3">
                      <span className={cn(
                        "font-mono text-sm font-bold",
                        p.status === "OUT" ? "text-status-cancelled" :
                        p.status === "LOW" || p.status === "SOON" ? "text-status-processing" :
                        "text-status-delivered"
                      )}>
                        {p.quantityAvailable}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {p.defectiveQty > 0 ? (
                        <span className="rounded bg-status-refunded-bg px-1.5 py-0.5 font-mono text-xs font-bold text-status-refunded">
                          {p.defectiveQty}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-light">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <Bell className={cn(
                          "h-3 w-3",
                          p.quantityAvailable <= p.lowStockThreshold
                            ? "text-status-cancelled"
                            : "text-muted-light"
                        )} />
                        <span className={cn(
                          "font-mono text-xs",
                          p.quantityAvailable <= p.lowStockThreshold
                            ? "font-bold text-status-cancelled"
                            : "text-muted"
                        )}>
                          {p.lowStockThreshold}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-mono text-sm">{p.stats.sold30}</span>
                      {p.stats.velocity > 0 && (
                        <span className="ml-1 text-[10px] text-muted">
                          {p.stats.velocity}/j
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {p.stats.daysLeft !== null ? (
                        <span className={cn(
                          "flex items-center gap-1 text-xs",
                          p.stats.daysLeft <= 7 ? "font-bold text-status-cancelled" :
                          p.stats.daysLeft <= 14 ? "text-status-processing" :
                          "text-muted"
                        )}>
                          <Calendar className="h-3 w-3" />
                          {p.stats.daysLeft}j
                        </span>
                      ) : (
                        <span className="text-xs text-muted-light">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn(
                        "rounded px-2 py-1 text-xs font-medium whitespace-nowrap",
                        STATUS_STYLE[p.status]
                      )}>
                        {STATUS_LABEL[p.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn(
                        "rounded-full px-2.5 py-1 text-xs font-medium",
                        p.isActive
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-slate-100 text-slate-500"
                      )}>
                        {p.isActive ? "Actif" : "Inactif"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="flex h-7 w-7 items-center justify-center rounded-md border border-border text-muted transition-colors group-hover:border-primary group-hover:bg-primary-soft group-hover:text-primary">
                        <Settings2 className="h-3.5 w-3.5" />
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {!loading && pageItems.length === 0 && (
            <div className="flex flex-col items-center justify-center py-24">
              <Package className="h-8 w-8 text-muted-light" />
              <p className="mt-2 text-sm font-medium">Aucun produit</p>
              <p className="mt-1 text-xs text-muted">
                Importez depuis Converty ou creez un produit manuellement.
              </p>
            </div>
          )}
        </div>

        <footer className="flex shrink-0 items-center justify-between border-t border-border bg-surface px-5 py-2.5">
          <p className="text-xs text-muted">{filtered.length} produits</p>
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

      {openId && (
        <ProductModal
          productId={openId}
          onClose={() => setOpenId(null)}
          onUpdated={fetchAll}
        />
      )}

      {showCreate && (
        <CreateProductModal
          stores={accessibleStores}
          onClose={() => setShowCreate(false)}
          onCreated={fetchAll}
        />
      )}

      {showImport && (
        <ImportProductsModal
          stores={accessibleStores as any}
          onClose={() => setShowImport(false)}
          onImported={fetchAll}
        />
      )}      {selectedIds.length > 0 && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 flex items-center gap-3 rounded-xl border border-border bg-surface px-5 py-3 shadow-xl">
          <span className="text-sm font-medium">
            {selectedIds.length} produit{selectedIds.length > 1 ? "s" : ""} selectionne{selectedIds.size > 1 ? "s" : ""}
          </span>
          <Button
            size="sm"
            variant="secondary"
            onClick={async () => {
              for (const id of selectedIds) {
                await fetch(`${API}/products/${id}`, {
                  method: "PATCH",
                  headers: { Authorization: `Bearer ${getToken()}`, "Content-Type": "application/json" },
                  body: JSON.stringify({ isActive: true }),
                });
              }
              setSelectedIds([]);
              fetchAll();
            }}
          >
            Activer
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={async () => {
              for (const id of selectedIds) {
                await fetch(`${API}/products/${id}`, {
                  method: "PATCH",
                  headers: { Authorization: `Bearer ${getToken()}`, "Content-Type": "application/json" },
                  body: JSON.stringify({ isActive: false }),
                });
              }
              setSelectedIds([]);
              fetchAll();
            }}
          >
            Desactiver
          </Button>
          <button onClick={() => setSelectedIds([])} className="text-muted hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}

export default function ProductsPage() {
  return (
    <RouteGuard>
      <ProductsContent />
    </RouteGuard>
  );
}