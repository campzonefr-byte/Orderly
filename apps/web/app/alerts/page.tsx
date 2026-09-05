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
  CheckCircle2, Package, Search, Bell, BellOff, RefreshCw,
} from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api";

function getToken() {
  return window.localStorage.getItem("orderly_token");
}

interface Product {
  id: string;
  storeId: string;
  sku: string;
  name: string;
  quantityAvailable: number;
  reservedQty: number;
  lowStockThreshold: number;
  updatedAt: string;
}

function timeSince(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function StockLevelBar({ qty, threshold }: { qty: number; threshold: number }) {
  const max = Math.max(threshold * 2, qty, 1);
  const pct = (qty / max) * 100;
  const color =
    qty === 0 ? "bg-status-cancelled" :
    qty <= threshold * 0.5 ? "bg-status-cancelled" :
    qty <= threshold ? "bg-status-processing" :
    "bg-status-delivered";

  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-24 rounded-full bg-surface-sunken">
        <div className={cn("h-1.5 rounded-full transition-all", color)} style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
      <span className={cn("text-xs font-medium",
        qty === 0 ? "text-status-cancelled" :
        qty <= threshold ? "text-status-processing" :
        "text-status-delivered"
      )}>{qty}</span>
    </div>
  );
}

function AlertsContent() {
  const { canAccessStore } = useAuth();
  const { stores } = useStores();
  const [products, setProducts] = useState<Product[]>([]);
  const [alertsOn, setAlertsOn] = useState<Record<string, boolean>>({});
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "critical" | "low" | "ok">("all");
  const [selectedStoreIds, setSelectedStoreIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const accessibleStores = stores.filter((s) => canAccessStore(s.id));

  useEffect(() => {
    if (stores.length > 0 && selectedStoreIds.length === 0) {
      setSelectedStoreIds(stores.map((s) => s.id));
    }
  }, [stores]);

  const fetchAllProducts = useCallback(async () => {
    if (accessibleStores.length === 0) return;
    setLoading(true);
    try {
      const results = await Promise.all(
        accessibleStores.map(async (store) => {
          const res = await fetch(`${API}/stores/${store.id}/products`, {
            headers: { Authorization: `Bearer ${getToken()}` },
          });
          const data = await res.json();
          return (data as Product[]).map((p) => ({ ...p, storeName: store.name }));
        })
      );
      const all = results.flat();
      setProducts(all);
      const defaultAlerts: Record<string, boolean> = {};
      all.forEach((p) => { defaultAlerts[p.id] = true; });
      setAlertsOn(defaultAlerts);
    } catch {
      setProducts([]);
    } finally {
      setLoading(false);
    }
  }, [accessibleStores.length]);

  useEffect(() => {
    fetchAllProducts();
  }, [fetchAllProducts]);

  async function restock(product: Product) {
    const newQty = product.lowStockThreshold * 3;
    await fetch(`${API}/stores/products/${product.id}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${getToken()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ quantityAvailable: newQty }),
    });
    fetchAllProducts();
  }

  const filtered = products.filter((p) => {
    if (!selectedStoreIds.includes(p.storeId)) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!p.name.toLowerCase().includes(q) && !p.sku.toLowerCase().includes(q)) return false;
    }
    if (filter === "critical") return p.quantityAvailable === 0;
    if (filter === "low") return p.quantityAvailable > 0 && p.quantityAvailable <= p.lowStockThreshold;
    if (filter === "ok") return p.quantityAvailable > p.lowStockThreshold;
    return true;
  });

  const criticalCount = products.filter((p) => selectedStoreIds.includes(p.storeId) && p.quantityAvailable === 0).length;
  const lowCount = products.filter((p) => selectedStoreIds.includes(p.storeId) && p.quantityAvailable > 0 && p.quantityAvailable <= p.lowStockThreshold).length;
  const okCount = products.filter((p) => selectedStoreIds.includes(p.storeId) && p.quantityAvailable > p.lowStockThreshold).length;

  const FILTER_TABS = [
    { key: "all", label: "All", count: products.filter((p) => selectedStoreIds.includes(p.storeId)).length },
    { key: "critical", label: "Out of stock", count: criticalCount },
    { key: "low", label: "Low stock", count: lowCount },
    { key: "ok", label: "OK", count: okCount },
  ] as const;

  return (
    <div className="flex h-screen bg-background">
      <Sidebar
        stores={accessibleStores}
        selectedStoreIds={selectedStoreIds}
        onChangeSelectedStores={setSelectedStoreIds}
      />

      <div className="flex min-w-0 flex-1 flex-col pt-14 md:pt-0">
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-surface px-5">
          <h1 className="text-base font-semibold">Stock Alerts</h1>
          <button
            onClick={fetchAllProducts}
            className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-muted hover:bg-surface-sunken hover:text-foreground"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </button>
        </header>

        <div className="grid grid-cols-3 gap-4 border-b border-border bg-surface p-5">
          <div className="rounded-lg bg-status-cancelled-bg px-4 py-3">
            <p className="text-xs font-medium text-status-cancelled">Out of stock</p>
            <p className="mt-1 text-2xl font-bold text-status-cancelled">{criticalCount}</p>
          </div>
          <div className="rounded-lg bg-status-processing-bg px-4 py-3">
            <p className="text-xs font-medium text-status-processing">Low stock</p>
            <p className="mt-1 text-2xl font-bold text-status-processing">{lowCount}</p>
          </div>
          <div className="rounded-lg bg-status-delivered-bg px-4 py-3">
            <p className="text-xs font-medium text-status-delivered">OK</p>
            <p className="mt-1 text-2xl font-bold text-status-delivered">{okCount}</p>
          </div>
        </div>

        <div className="flex items-center gap-3 border-b border-border bg-surface px-5 py-3">
          <div className="relative w-64">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-light" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search SKU or product..." className="pl-8" />
          </div>
          <div className="flex gap-1">
            {FILTER_TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setFilter(tab.key)}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                  filter === tab.key ? "bg-primary-soft text-primary" : "text-muted hover:bg-surface-sunken hover:text-foreground"
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

        <div className="flex-1 overflow-auto">
          {loading ? (
            <div className="flex items-center justify-center py-24">
              <p className="text-sm text-muted">Loading stock data...</p>
            </div>
          ) : (
            <table className="w-full border-collapse text-sm">
              <thead className="sticky top-0 z-10 bg-surface">
                <tr className="border-b border-border text-left text-xs font-medium text-muted">
                  <th className="px-5 py-2.5">Product</th>
                  <th className="px-4 py-2.5">Store</th>
                  <th className="px-4 py-2.5">SKU</th>
                  <th className="px-4 py-2.5">Available</th>
                  <th className="px-4 py-2.5">Reserved</th>
                  <th className="px-4 py-2.5">Threshold</th>
                  <th className="px-4 py-2.5">Updated</th>
                  <th className="px-4 py-2.5">Alert</th>
                  <th className="px-4 py-2.5">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((item) => {
                  const isOut = item.quantityAvailable === 0;
                  return (
                    <tr key={item.id} className={cn("border-b border-border transition-colors hover:bg-surface-sunken", isOut && "bg-status-cancelled-bg/30")}>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-surface-sunken">
                            <Package className="h-4 w-4 text-muted-light" />
                          </div>
                          <span className="text-sm font-medium">{item.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted">
                        {stores.find((s) => s.id === item.storeId)?.name ?? item.storeId}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">{item.sku}</td>
                      <td className="px-4 py-3">
                        <StockLevelBar qty={item.quantityAvailable} threshold={item.lowStockThreshold} />
                      </td>
                      <td className="px-4 py-3 text-xs text-muted">{item.reservedQty}</td>
                      <td className="px-4 py-3 text-xs text-muted">{item.lowStockThreshold}</td>
                      <td className="px-4 py-3 text-xs text-muted">{timeSince(item.updatedAt)}</td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => setAlertsOn((prev) => ({ ...prev, [item.id]: !prev[item.id] }))}
                          className={cn("flex items-center gap-1.5 text-xs font-medium transition-colors", alertsOn[item.id] ? "text-status-delivered" : "text-muted")}
                        >
                          {alertsOn[item.id] ? <Bell className="h-3.5 w-3.5" /> : <BellOff className="h-3.5 w-3.5" />}
                          {alertsOn[item.id] ? "On" : "Off"}
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        <Button size="sm" variant="secondary" onClick={() => restock(item)}>
                          <RefreshCw className="h-3 w-3" />
                          Restock
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}

          {!loading && filtered.length === 0 && (
            <div className="flex flex-col items-center justify-center py-24">
              <CheckCircle2 className="h-8 w-8 text-status-delivered" />
              <p className="mt-2 text-sm font-medium">All good here</p>
              <p className="mt-1 text-xs text-muted">No stock alerts match your filter.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function AlertsPage() {
  return (
    <RouteGuard>
      <AlertsContent />
    </RouteGuard>
  );
}