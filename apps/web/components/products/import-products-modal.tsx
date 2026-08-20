"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  X, Search, Package, Check, Download,
  ChevronDown, ChevronRight, AlertTriangle,
} from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api";

function getToken() {
  return window.localStorage.getItem("orderly_token");
}
function providerFor(sourceType?: string) {
    return sourceType === "SHOPIFY" ? "shopify" : "converty";
  }

interface Variant {
  id: string;
  sku: string;
  label: string;
  price: number;
  cost: number;
  stock: number;
  alertOn: number;
  alreadyImported: boolean;
}

interface RemoteProduct {
  id: string;
  name: string;
  sku: string;
  price: number;
  cost: number;
  stock: number;
  image: string | null;
  status: string;
  alreadyImported: boolean;
  variants: Variant[];
}

export function ImportProductsModal({
  stores,
  onClose,
  onImported,
}: {
  stores: { id: string; name: string; sourceType: string }[];
  onClose: () => void;
  onImported: () => void;
}) {
  const [storeId, setStoreId] = useState(stores[0]?.id ?? "");
  const [items, setItems] = useState<RemoteProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Map<string, any>>(new Map());
  const [importing, setImporting] = useState(false);
  const load = useCallback(async () => {
    if (!storeId) return;
    setLoading(true);
    setError("");
    setItems([]);
    setSelected(new Map());

    const store = stores.find((s) => s.id === storeId);
    const provider = providerFor(store?.sourceType);

    try {
      const res = await fetch(
        `${API}/integrations/${provider}/${storeId}/browse-products`,
        { headers: { Authorization: `Bearer ${getToken()}` } }
      );
      const data = await res.json();
      if (!data.ok) {
        setError(data.error ?? "Impossible de charger les produits");
        return;
      }
      setItems(data.items ?? []);
    } catch {
      setError("Erreur reseau");
    } finally {
      setLoading(false);
    }
  }, [storeId, stores]);
  
  useEffect(() => {
    if (!storeId && stores.length > 0) {
      setStoreId(stores[0].id);
    }
  }, [stores, storeId]);

  useEffect(() => {
    load();
  }, [load]);
  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function toggleProduct(p: RemoteProduct) {
    setSelected((prev) => {
      const next = new Map(prev);
      if (p.variants.length > 0) {
        const allSelected = p.variants.every((v) => next.has(v.sku));
        p.variants.forEach((v) => {
          if (allSelected) next.delete(v.sku);
          else
            next.set(v.sku, {
              sku: v.sku,
              name: `${p.name} - ${v.label}`,
              stock: v.stock,
              price: v.price,
              cost: v.cost,
              alertOn: v.alertOn,
            });
        });
      } else {
        if (next.has(p.sku)) next.delete(p.sku);
        else
          next.set(p.sku, {
            sku: p.sku,
            name: p.name,
            stock: p.stock,
            price: p.price,
            cost: p.cost,
            alertOn: 5,
          });
      }
      return next;
    });
  }

  function toggleVariant(p: RemoteProduct, v: Variant) {
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(v.sku)) next.delete(v.sku);
      else
        next.set(v.sku, {
          sku: v.sku,
          name: `${p.name} - ${v.label}`,
          stock: v.stock,
          price: v.price,
          cost: v.cost,
          alertOn: v.alertOn,
        });
      return next;
    });
  }

  function selectAll() {
    const next = new Map<string, any>();
    filtered.forEach((p) => {
      if (p.variants.length > 0) {
        p.variants.forEach((v) =>
          next.set(v.sku, {
            sku: v.sku,
            name: `${p.name} - ${v.label}`,
            stock: v.stock,
            price: v.price,
            cost: v.cost,
            alertOn: v.alertOn,
          })
        );
      } else {
        next.set(p.sku, {
          sku: p.sku,
          name: p.name,
          stock: p.stock,
          price: p.price,
          cost: p.cost,
          alertOn: 5,
        });
      }
    });
    setSelected(next);
  }

  async function doImport() {
    if (selected.size === 0) return;
    setImporting(true);

    const store = stores.find((s) => s.id === storeId);
    const provider = providerFor(store?.sourceType);

    try {
      const res = await fetch(
        `${API}/integrations/${provider}/${storeId}/import-selected`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${getToken()}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ selections: Array.from(selected.values()) }),
        }
      );
      const data = await res.json();
      alert(
        `Import termine.\n${data.created} produits crees, ${data.updated} mis a jour.`
      );
      onImported();
      onClose();
    } catch {
      alert("Erreur lors de l'import");
    } finally {
      setImporting(false);
    }
  }

  const filtered = items.filter((p) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      p.name.toLowerCase().includes(q) ||
      p.sku.toLowerCase().includes(q) ||
      p.variants.some((v) => v.sku.toLowerCase().includes(q))
    );
  });

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-foreground/30 backdrop-blur-[2px]">
      <div className="flex max-h-[92vh] w-full max-w-2xl flex-col rounded-xl border border-border bg-surface shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold">Importer des produits</h2>
            <p className="text-xs text-muted">Depuis vos boutiques connectees</p>
          </div>
          <button onClick={onClose} className="rounded-md p-1 hover:bg-surface-sunken">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3 border-b border-border px-5 py-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">Magasin</label>
            <select
              value={storeId}
              onChange={(e) => setStoreId(e.target.value)}
              className="h-9 w-full rounded-md border border-border bg-surface px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.sourceType === "SHOPIFY" ? "Shopify" : "Converty"})
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-light" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Rechercher un produit..."
                className="h-8 pl-8 text-xs"
              />
            </div>
            <Button size="sm" variant="secondary" onClick={selectAll} disabled={filtered.length === 0}>
              Tout selectionner
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {loading ? (
            <p className="py-12 text-center text-sm text-muted">Chargement des produits...</p>
          ) : error ? (
            <div className="flex items-start gap-2.5 rounded-lg bg-status-cancelled-bg px-4 py-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-status-cancelled" />
              <div className="text-xs text-status-cancelled">
                <p className="font-semibold">{error}</p>
                               <p className="mt-0.5">
                  {providerFor(stores.find((s) => s.id === storeId)?.sourceType) === "shopify"
                    ? "Verifiez le domaine et l'access token Shopify dans la page Integrations. Le token doit avoir la permission read_products."
                    : "Verifiez que ce magasin est bien connecte a Converty dans la page Magasins."}
                </p>
              </div>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Package className="h-8 w-8 text-muted-light" />
              <p className="mt-2 text-sm text-muted">Aucun produit trouve</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map((p) => {
                const hasVariants = p.variants.length > 0;
                const isExpanded = expanded.has(p.id);
                const selectedCount = hasVariants
                  ? p.variants.filter((v) => selected.has(v.sku)).length
                  : selected.has(p.sku)
                  ? 1
                  : 0;
                const allSelected = hasVariants
                  ? selectedCount === p.variants.length
                  : selected.has(p.sku);

                return (
                  <div key={p.id} className="rounded-lg border border-border">
                    <div
                      className={cn(
                        "flex items-center gap-3 px-3 py-2.5 transition-colors",
                        allSelected && "bg-primary-soft/40"
                      )}
                    >
                      <button
                        onClick={() => toggleProduct(p)}
                        className={cn(
                          "flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 transition-colors",
                          allSelected
                            ? "border-primary bg-primary"
                            : selectedCount > 0
                            ? "border-primary bg-primary-soft"
                            : "border-border"
                        )}
                      >
                        {allSelected && <Check className="h-3 w-3 text-white" />}
                        {!allSelected && selectedCount > 0 && (
                          <span className="h-2 w-2 rounded-sm bg-primary" />
                        )}
                      </button>

                      {p.image ? (
                        <img
                          src={p.image}
                          alt=""
                          className="h-9 w-9 shrink-0 rounded object-cover"
                        />
                      ) : (
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded bg-surface-sunken">
                          <Package className="h-4 w-4 text-muted-light" />
                        </div>
                      )}

                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{p.name}</p>
                        <p className="font-mono text-[11px] text-muted">
                          {p.sku}
                          {hasVariants && ` · ${p.variants.length} variantes`}
                        </p>
                      </div>

                      {!hasVariants && (
                        <span className="shrink-0 font-mono text-xs text-muted">
                          {p.stock} en stock
                        </span>
                      )}

                      {p.alreadyImported && (
                        <span className="shrink-0 rounded bg-surface-sunken px-1.5 py-0.5 text-[10px] text-muted">
                          deja importe
                        </span>
                      )}

                      {hasVariants && (
                        <button
                          onClick={() => toggleExpand(p.id)}
                          className="shrink-0 rounded p-1 text-muted hover:bg-surface-sunken"
                        >
                          {isExpanded ? (
                            <ChevronDown className="h-4 w-4" />
                          ) : (
                            <ChevronRight className="h-4 w-4" />
                          )}
                        </button>
                      )}
                    </div>

                    {hasVariants && isExpanded && (
                      <div className="divide-y divide-border border-t border-border">
                        {p.variants.map((v) => (
                          <div
                            key={v.id}
                            className={cn(
                              "flex items-center gap-3 px-3 py-2 pl-11 transition-colors",
                              selected.has(v.sku) && "bg-primary-soft/30"
                            )}
                          >
                            <button
                              onClick={() => toggleVariant(p, v)}
                              className={cn(
                                "flex h-4 w-4 shrink-0 items-center justify-center rounded border-2 transition-colors",
                                selected.has(v.sku)
                                  ? "border-primary bg-primary"
                                  : "border-border"
                              )}
                            >
                              {selected.has(v.sku) && (
                                <Check className="h-2.5 w-2.5 text-white" />
                              )}
                            </button>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-xs font-medium">{v.label}</p>
                              <p className="font-mono text-[10px] text-muted">{v.sku}</p>
                            </div>
                            <span className="shrink-0 font-mono text-[11px] text-muted">
                              {v.price} TND
                            </span>
                            <span
                              className={cn(
                                "shrink-0 rounded px-1.5 py-0.5 font-mono text-[10px] font-medium",
                                v.stock === 0
                                  ? "bg-status-cancelled-bg text-status-cancelled"
                                  : v.stock <= v.alertOn
                                  ? "bg-status-processing-bg text-status-processing"
                                  : "bg-status-delivered-bg text-status-delivered"
                              )}
                            >
                              {v.stock}
                            </span>
                            {v.alreadyImported && (
                              <span className="shrink-0 text-[10px] text-muted-light">
                                importe
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 border-t border-border px-5 py-4">
          <p className="flex-1 text-xs text-muted">
            {selected.size > 0
              ? `${selected.size} produit${selected.size > 1 ? "s" : ""} selectionne${selected.size > 1 ? "s" : ""}`
              : "Aucune selection"}
          </p>
          <Button variant="secondary" onClick={onClose}>Annuler</Button>
          <Button disabled={importing || selected.size === 0} onClick={doImport}>
            <Download className="h-3.5 w-3.5" />
            {importing ? "Import..." : `Importer ${selected.size || ""}`}
          </Button>
        </div>
      </div>
    </div>
  );
}