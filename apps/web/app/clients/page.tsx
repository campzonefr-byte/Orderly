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
  Search, ChevronLeft, ChevronRight, Users, X,
  Phone, MapPin, Package, TrendingUp, Calendar,
  ShoppingBag, AlertTriangle, Star,
} from "lucide-react";
import { TagBadge } from "@/components/orders/tag-picker";
import { ORDER_STATUS_LABELS, OrderStatus } from "@/types/order";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api";

function getToken() {
  return window.localStorage.getItem("orderly_token");
}

function formatDate(iso: string | Date) {
  return new Date(iso).toLocaleDateString("fr-FR", {
    day: "numeric", month: "short", year: "numeric",
  });
}

function money(n: number) {
  return n.toLocaleString("fr-FR", { maximumFractionDigits: 0 });
}

interface Customer {
  phone: string;
  displayPhone: string;
  phone2: string | null;
  name: string;
  email: string | null;
  city: string | null;
  address: string | null;
  storeNames: string[];
  sources: string[];
  tags: string[];
  totalOrders: number;
  confirmed: number;
  refused: number;
  delivered: number;
  returned: number;
  confirmationRate: number;
  deliveryRate: number;
  returnRate: number;
  lifetimeValue: number;
  totalOrdered: number;
  avgBasket: number;
  firstOrder: string;
  lastOrder: string;
  daysSinceLast: number;
  topProducts: { title: string; qty: number; revenue: number }[];
  orders: any[];
}

function RateBadge({ label, value, good }: { label: string; value: number; good: "high" | "low" }) {
  const isGood = good === "high" ? value >= 70 : value <= 20;
  const isMid = good === "high" ? value >= 40 : value <= 40;
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[10px] text-muted">{label}</span>
      <span className={cn(
        "rounded px-1.5 py-0.5 text-[11px] font-bold",
        isGood ? "bg-status-delivered-bg text-status-delivered" :
        isMid ? "bg-status-processing-bg text-status-processing" :
        "bg-status-cancelled-bg text-status-cancelled"
      )}>
        {value}%
      </span>
    </div>
  );
}

function CustomerDetail({ customer, onClose }: { customer: Customer; onClose: () => void }) {
  const isVip = customer.lifetimeValue >= 500;
  const isRisky = customer.returnRate > 40;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-foreground/30 backdrop-blur-[2px]">
      <div className="w-full max-w-3xl rounded-xl border border-border bg-surface shadow-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-start justify-between border-b border-border px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary text-base font-bold text-white">
              {customer.name[0]?.toUpperCase()}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold">{customer.name}</h2>
                {isVip && (
                  <span className="flex items-center gap-1 rounded bg-yellow-100 px-1.5 py-0.5 text-[10px] font-bold text-yellow-700">
                    <Star className="h-2.5 w-2.5" /> VIP
                  </span>
                )}
                {isRisky && (
                  <span className="flex items-center gap-1 rounded bg-status-cancelled-bg px-1.5 py-0.5 text-[10px] font-bold text-status-cancelled">
                    <AlertTriangle className="h-2.5 w-2.5" /> Risque
                  </span>
                )}
              </div>
              <p className="font-mono text-xs text-muted">{customer.displayPhone}</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-md p-1 hover:bg-surface-sunken">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* KPIs */}
          <div className="grid grid-cols-4 gap-3">
            <div className="rounded-lg bg-primary-soft px-3 py-2.5">
              <p className="text-[10px] font-medium text-primary">Valeur totale</p>
              <p className="mt-0.5 font-mono text-lg font-bold text-primary">{money(customer.lifetimeValue)}</p>
              <p className="text-[10px] text-primary/70">TND encaissés</p>
            </div>
            <div className="rounded-lg bg-surface-sunken px-3 py-2.5">
              <p className="text-[10px] font-medium text-muted">Commandes</p>
              <p className="mt-0.5 text-lg font-bold">{customer.totalOrders}</p>
              <p className="text-[10px] text-muted">{customer.delivered} livrées</p>
            </div>
            <div className="rounded-lg bg-status-delivered-bg px-3 py-2.5">
              <p className="text-[10px] font-medium text-status-delivered">Confirmation</p>
              <p className="mt-0.5 text-lg font-bold text-status-delivered">{customer.confirmationRate}%</p>
              <p className="text-[10px] text-status-delivered/70">répond au tel</p>
            </div>
            <div className="rounded-lg bg-status-refunded-bg px-3 py-2.5">
              <p className="text-[10px] font-medium text-status-refunded">Retours</p>
              <p className="mt-0.5 text-lg font-bold text-status-refunded">{customer.returnRate}%</p>
              <p className="text-[10px] text-status-refunded/70">{customer.returned} retours</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Info */}
            <div className="rounded-lg border border-border p-3.5 space-y-2 text-xs">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted">Coordonnées</p>
              <p className="flex items-center gap-1.5 font-mono">
                <Phone className="h-3 w-3 text-muted" /> {customer.displayPhone}
              </p>
              {customer.phone2 && (
                <p className="flex items-center gap-1.5 font-mono text-muted">
                  <Phone className="h-3 w-3" /> {customer.phone2}
                </p>
              )}
              {(customer.city || customer.address) && (
                <p className="flex items-start gap-1.5 text-muted">
                  <MapPin className="mt-0.5 h-3 w-3 shrink-0" />
                  {[customer.address, customer.city].filter(Boolean).join(", ")}
                </p>
              )}
              <div className="pt-1 space-y-1">
                <p className="text-muted">Panier moyen : <span className="font-mono font-semibold text-foreground">{money(customer.avgBasket)} TND</span></p>
                <p className="text-muted">1ère commande : {formatDate(customer.firstOrder)}</p>
                <p className="text-muted">
                  Dernière : {formatDate(customer.lastOrder)}
                  <span className="ml-1 text-muted-light">({customer.daysSinceLast}j)</span>
                </p>
              </div>
            </div>

            {/* Sources + tags */}
            <div className="rounded-lg border border-border p-3.5 space-y-3">
              <div>
                <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted">Provenance</p>
                <div className="flex flex-wrap gap-1.5">
                  {customer.sources.map((s) => (
                    <span key={s} className="rounded-full bg-surface-sunken px-2 py-0.5 text-[11px] font-medium">
                      {s}
                    </span>
                  ))}
                </div>
              </div>
              {customer.tags.length > 0 && (
                <div>
                  <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted">Tags</p>
                  <div className="flex flex-wrap gap-1.5">
                    {customer.tags.map((t) => <TagBadge key={t} tag={t} />)}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Top products */}
          {customer.topProducts.length > 0 && (
            <div className="rounded-lg border border-border">
              <div className="border-b border-border px-3.5 py-2.5">
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted">
                  Produits les plus achetés
                </p>
              </div>
              <div className="divide-y divide-border">
                {customer.topProducts.map((p) => (
                  <div key={p.title} className="flex items-center gap-3 px-3.5 py-2">
                    <Package className="h-3.5 w-3.5 shrink-0 text-muted-light" />
                    <p className="min-w-0 flex-1 truncate text-xs font-medium">{p.title}</p>
                    <span className="shrink-0 text-xs text-muted">× {p.qty}</span>
                    <span className="shrink-0 font-mono text-xs font-semibold">{money(p.revenue)} TND</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Order history */}
          <div className="rounded-lg border border-border">
            <div className="border-b border-border px-3.5 py-2.5">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted">
                Historique ({customer.orders.length})
              </p>
            </div>
            <div className="max-h-64 overflow-y-auto divide-y divide-border">
              {customer.orders.map((o) => (
                <div key={o.id} className="flex items-center gap-3 px-3.5 py-2">
                  <span className="shrink-0 font-mono text-xs font-semibold">{o.orderNumber}</span>
                  <span className="shrink-0 text-[11px] text-muted">{formatDate(o.date)}</span>
                  <span className="min-w-0 flex-1 truncate text-[11px] text-muted">
                    {o.storeName} · {o.itemCount} art.
                  </span>
                  {o.agent && (
                    <span className="shrink-0 text-[10px] text-muted-light">{o.agent}</span>
                  )}
                  <span className={cn(
                    "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium",
                    o.isDelivered ? "bg-status-delivered-bg text-status-delivered" :
                    o.isReturned ? "bg-status-refunded-bg text-status-refunded" :
                    o.isRefused ? "bg-status-cancelled-bg text-status-cancelled" :
                    "bg-surface-sunken text-muted"
                  )}>
                    {ORDER_STATUS_LABELS[o.status as OrderStatus] ?? o.status}
                  </span>
                  <span className="shrink-0 font-mono text-xs font-semibold">{money(o.total)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="border-t border-border px-5 py-4">
          <Button variant="secondary" className="w-full" onClick={onClose}>Fermer</Button>
        </div>
      </div>
    </div>
  );
}

const PAGE_SIZE = 25;

function ClientsContent() {
  const { canAccessStore } = useAuth();
  const { stores } = useStores();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedStoreIds, setSelectedStoreIds] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState<"value" | "orders" | "recent" | "rate">("value");
  const [detail, setDetail] = useState<Customer | null>(null);

  const accessibleStores = stores.filter((s) => canAccessStore(s.id));

  useEffect(() => {
    if (stores.length > 0 && selectedStoreIds.length === 0) {
      setSelectedStoreIds(stores.map((s) => s.id));
    }
  }, [stores]);

  const fetchCustomers = useCallback(async () => {
    if (selectedStoreIds.length === 0) return;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("storeIds", selectedStoreIds.join(","));
      const res = await fetch(`${API}/orders/stats/customers?${params}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const data = await res.json();
      setCustomers(Array.isArray(data) ? data : []);
    } catch {
      setCustomers([]);
    } finally {
      setLoading(false);
    }
  }, [selectedStoreIds]);

  useEffect(() => {
    fetchCustomers();
  }, [fetchCustomers]);

  const filtered = customers
    .filter((c) => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        c.name.toLowerCase().includes(q) ||
        (c.displayPhone ?? "").includes(q) ||
        (c.city ?? "").toLowerCase().includes(q)
      );
    })
    .sort((a, b) => {
      if (sortBy === "value") return b.lifetimeValue - a.lifetimeValue;
      if (sortBy === "orders") return b.totalOrders - a.totalOrders;
      if (sortBy === "rate") return b.confirmationRate - a.confirmationRate;
      return a.daysSinceLast - b.daysSinceLast;
    });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageCustomers = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const totalLTV = customers.reduce((s, c) => s + c.lifetimeValue, 0);
  const vipCount = customers.filter((c) => c.lifetimeValue >= 500).length;
  const loyalCount = customers.filter((c) => c.totalOrders >= 2).length;

  return (
    <div className="flex h-screen bg-background">
      <Sidebar
        stores={accessibleStores}
        selectedStoreIds={selectedStoreIds}
        onChangeSelectedStores={setSelectedStoreIds}
      />

      <div className="flex min-w-0 flex-1 flex-col pt-14 md:pt-0">
        <header className="flex min-h-14 w-full max-w-full shrink-0 flex-wrap items-center justify-between gap-2 overflow-hidden border-b border-border bg-surface px-3 py-2 md:h-14 md:flex-nowrap md:px-5 md:py-0">
          <h1 className="text-base font-semibold">Clients</h1>
          <p className="text-xs text-muted">{customers.length} clients</p>
        </header>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-3 border-b border-border bg-surface p-4">
          <div className="rounded-lg bg-surface-sunken px-4 py-3">
            <p className="text-[11px] font-medium text-muted">Total clients</p>
            <p className="mt-1 text-2xl font-bold">{customers.length}</p>
          </div>
          <div className="rounded-lg bg-primary-soft px-4 py-3">
            <p className="text-[11px] font-medium text-primary">Valeur cumulée</p>
            <p className="mt-1 text-2xl font-bold text-primary font-mono">{money(totalLTV)}</p>
          </div>
          <div className="rounded-lg bg-purple-50 px-4 py-3">
            <p className="text-[11px] font-medium text-purple-600">Clients fidèles</p>
            <p className="mt-1 text-2xl font-bold text-purple-600">{loyalCount}</p>
          </div>
          <div className="rounded-lg bg-yellow-50 px-4 py-3">
            <p className="text-[11px] font-medium text-yellow-700">VIP (500+ TND)</p>
            <p className="mt-1 text-2xl font-bold text-yellow-700">{vipCount}</p>
          </div>
        </div>

        {/* Search + sort */}
        <div className="flex flex-col gap-2 border-b border-border bg-surface px-5 py-3 md:flex-row md:items-center md:gap-3">
          <div className="relative w-72">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-light" />
            <Input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="Rechercher nom, téléphone, ville..."
              className="pl-8"
            />
          </div>
          <div className="flex gap-1 overflow-x-auto">
            {[
              { key: "value", label: "Valeur" },
              { key: "orders", label: "Commandes" },
              { key: "rate", label: "Taux confirmation" },
              { key: "recent", label: "Récents" },
            ].map((s) => (
              <button
                key={s.key}
                onClick={() => setSortBy(s.key as any)}
                className={cn(
                  "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                  sortBy === s.key ? "bg-primary-soft text-primary" : "text-muted hover:bg-surface-sunken"
                )}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto">
          {loading ? (
            <p className="py-24 text-center text-sm text-muted">Chargement...</p>
          ) : (
            <table className="w-full border-collapse text-sm">
              <thead className="sticky top-0 z-10 bg-surface">
                <tr className="border-b border-border text-left text-xs font-medium text-muted">
                  <th className="px-4 py-2.5">Client</th>
                  <th className="px-4 py-2.5">Ville</th>
                  <th className="px-4 py-2.5">Commandes</th>
                  <th className="px-4 py-2.5">Confirmation</th>
                  <th className="px-4 py-2.5">Livraison</th>
                  <th className="px-4 py-2.5">Retours</th>
                  <th className="px-4 py-2.5">Valeur totale</th>
                  <th className="px-4 py-2.5">Dernière</th>
                  <th className="px-4 py-2.5">Tags</th>
                </tr>
              </thead>
              <tbody>
                {pageCustomers.map((c) => {
                  const isVip = c.lifetimeValue >= 500;
                  const isRisky = c.returnRate > 40;
                  return (
                    <tr
                      key={c.phone}
                      onClick={() => setDetail(c)}
                      className="cursor-pointer border-b border-border transition-colors hover:bg-surface-sunken"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className={cn(
                            "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white",
                            isVip ? "bg-yellow-500" : isRisky ? "bg-status-cancelled" : "bg-primary"
                          )}>
                            {c.name[0]?.toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <p className="truncate text-sm font-medium max-w-[130px]">{c.name}</p>
                              {isVip && <Star className="h-3 w-3 shrink-0 text-yellow-500" />}
                              {isRisky && <AlertTriangle className="h-3 w-3 shrink-0 text-status-cancelled" />}
                            </div>
                            <p className="font-mono text-[11px] text-muted">{c.displayPhone}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted">{c.city ?? "—"}</td>
                      <td className="px-4 py-3">
                        <span className="font-mono text-sm font-semibold">{c.totalOrders}</span>
                        <span className="ml-1 text-[11px] text-muted">({c.delivered} livrées)</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={cn(
                          "rounded px-2 py-1 text-xs font-bold",
                          c.confirmationRate >= 70 ? "bg-status-delivered-bg text-status-delivered" :
                          c.confirmationRate >= 40 ? "bg-status-processing-bg text-status-processing" :
                          "bg-status-cancelled-bg text-status-cancelled"
                        )}>
                          {c.confirmationRate}%
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={cn(
                          "rounded px-2 py-1 text-xs font-bold",
                          c.deliveryRate >= 70 ? "bg-status-delivered-bg text-status-delivered" :
                          c.deliveryRate >= 40 ? "bg-status-processing-bg text-status-processing" :
                          "bg-status-cancelled-bg text-status-cancelled"
                        )}>
                          {c.deliveryRate}%
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={cn(
                          "rounded px-2 py-1 text-xs font-bold",
                          c.returnRate <= 20 ? "bg-status-delivered-bg text-status-delivered" :
                          c.returnRate <= 40 ? "bg-status-processing-bg text-status-processing" :
                          "bg-status-cancelled-bg text-status-cancelled"
                        )}>
                          {c.returnRate}%
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-mono text-sm font-bold">{money(c.lifetimeValue)} TND</p>
                        <p className="text-[10px] text-muted">Panier {money(c.avgBasket)}</p>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted whitespace-nowrap">
                        {formatDate(c.lastOrder)}
                        <p className="text-[10px] text-muted-light">il y a {c.daysSinceLast}j</p>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1 max-w-[120px]">
                          {c.tags.slice(0, 2).map((t) => <TagBadge key={t} tag={t} />)}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}

          {!loading && pageCustomers.length === 0 && (
            <div className="flex flex-col items-center justify-center py-24">
              <Users className="h-8 w-8 text-muted-light" />
              <p className="mt-2 text-sm font-medium">Aucun client</p>
            </div>
          )}
        </div>

        <footer className="flex shrink-0 items-center justify-between border-t border-border bg-surface px-5 py-2.5">
          <p className="text-xs text-muted">{filtered.length} clients</p>
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

      {detail && <CustomerDetail customer={detail} onClose={() => setDetail(null)} />}
    </div>
  );
}

export default function ClientsPage() {
  return (
    <RouteGuard>
      <ClientsContent />
    </RouteGuard>
  );
}