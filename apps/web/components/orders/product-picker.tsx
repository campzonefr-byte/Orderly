"use client";

import { useState, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { Search, Package, ChevronDown, X, Check } from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api";

function getToken() {
  return window.localStorage.getItem("orderly_token");
}

export interface StoreProduct {
  id: string;
  sku: string;
  name: string;
  quantityAvailable: number;
  lowStockThreshold: number;
  price?: number;
  imageUrl?: string | null;
}

export function useStoreProducts(storeId?: string) {
  const [products, setProducts] = useState<StoreProduct[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!storeId) {
      setProducts([]);
      return;
    }
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(`${API}/products?storeIds=${storeId}`, {
          headers: { Authorization: `Bearer ${getToken()}` },
        });
        const data = await res.json();
        setProducts(Array.isArray(data) ? data.filter((p: any) => p.isActive !== false).map((p: any) => ({
          id: p.id,
          sku: p.sku,
          name: p.name,
          quantityAvailable: p.quantityAvailable,
          lowStockThreshold: p.lowStockThreshold,
          price: Number(p.sellPrice ?? 0),
          imageUrl: p.imageUrl ?? null,
        })) : []);
      } catch {
        setProducts([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [storeId]);

  return { products, loading };
}

export function ProductPicker({
  value,
  productId,
  onSelect,
  products,
  loading,
  placeholder = "Choisir un produit...",
  className,
}: {
  value: string;
  productId?: string | null;
  onSelect: (product: StoreProduct | null, rawText: string) => void;
  products: StoreProduct[];
  loading?: boolean;
  placeholder?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const search = query || value;
  const filtered = products.filter(
    (p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      (p.sku ?? "").toLowerCase().includes(search.toLowerCase())
  );

  function pick(p: StoreProduct) {
    onSelect(p, p.name);
    setQuery("");
    setOpen(false);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!open) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && filtered[activeIdx]) {
      e.preventDefault();
      pick(filtered[activeIdx]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div className={cn("relative", className)}>
      <div className="relative">
        <Package className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-light" />
        <input
          ref={inputRef}
          value={open ? query : (productId ? (products.find((p) => p.id === productId)?.name ?? value) : value)}
          onChange={(e) => {
            setQuery(e.target.value);
            onSelect(null, e.target.value);
            setOpen(true);
            setActiveIdx(0);
          }}
          onFocus={() => { setQuery(value); setOpen(true); }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="h-8 w-full rounded-md border border-border bg-surface pl-8 pr-7 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        />
        <button
          type="button"
          onClick={() => { setOpen((v) => !v); setQuery(""); inputRef.current?.focus(); }}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted hover:text-foreground"
        >
          <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} />
        </button>
      </div>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-[calc(100%+4px)] z-50 max-h-56 w-full min-w-[260px] overflow-y-auto rounded-lg border border-border bg-surface py-1 shadow-xl">
            {loading ? (
              <p className="px-3 py-3 text-center text-xs text-muted">Chargement...</p>
            ) : filtered.length === 0 ? (
              <div className="px-3 py-3">
                <p className="text-xs text-muted">Aucun produit trouvé</p>
                {search && (
                  <p className="mt-1 text-[11px] text-muted-light">
                    "{search}" sera utilisé comme texte libre
                  </p>
                )}
              </div>
            ) : (
              filtered.map((p, i) => {
                const lowStock = p.quantityAvailable <= p.lowStockThreshold;
                const isSelected = productId ? p.id === productId : p.name === value;
                return (
                  <button
                  key={p.id}
                  type="button"
                  onMouseDown={(e) => { e.preventDefault(); pick(p); }}
                  onMouseEnter={() => setActiveIdx(i)}
                  className={cn(
                    "flex w-full items-center gap-2 px-3 py-2 text-left transition-colors",
                    i === activeIdx ? "bg-primary-soft" : "hover:bg-surface-sunken"
                  )}
                >
                  {(p as any).imageUrl ? (
                    <img
                      src={(p as any).imageUrl}
                      alt=""
                      className="h-8 w-8 shrink-0 rounded object-cover border border-border"
                    />
                  ) : (
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-surface-sunken border border-border">
                      <Package className="h-3.5 w-3.5 text-muted-light" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium">{p.name}</p>
                    <p className="truncate text-[10px] text-muted font-mono">{p.sku}</p>
                  </div>
                    <span
                      className={cn(
                        "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium",
                        p.quantityAvailable === 0
                          ? "bg-status-cancelled-bg text-status-cancelled"
                          : lowStock
                          ? "bg-status-processing-bg text-status-processing"
                          : "bg-status-delivered-bg text-status-delivered"
                      )}
                    >
                      {p.quantityAvailable}
                    </span>
                    {isSelected && <Check className="h-3 w-3 shrink-0 text-primary" />}
                  </button>
                );
              })
            )}
          </div>
        </>
      )}
    </div>
  );
}

export function StorePicker({
  stores,
  value,
  onChange,
  className,
}: {
  stores: { id: string; name: string }[];
  value: string;
  onChange: (storeId: string) => void;
  className?: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        "h-9 w-full rounded-md border border-border bg-surface px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
        className
      )}
    >
      <option value="">Choisir un magasin...</option>
      {stores.map((s) => (
        <option key={s.id} value={s.id}>{s.name}</option>
      ))}
    </select>
  );
}