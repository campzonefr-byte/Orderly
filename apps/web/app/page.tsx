"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar";
import { RouteGuard } from "@/components/auth/route-guard";
import { useStores } from "@/lib/stores-context";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";
import {
  AlertTriangle, Calendar, MessageSquare, Package,
  ArrowRight, TrendingUp,Lock,
} from "lucide-react";
import {
  PeriodFilter,
  getPeriodRange,
  type Period,
} from "@/components/stats/period-filter";
import {
  KpiCard,
  TimelineChart,
  StatusBars,
  CarrierTable,
  TopProducts,
  money,
} from "@/components/dashboard/dashboard-widgets";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api";

function getToken() {
  return window.localStorage.getItem("orderly_token");
}

interface DashboardData {
  kpis: any;
  timeline: any[];
  statusCounts: Record<string, number>;
  topProducts: any[];
  carriers: any[];
  storeStats: any[];
  alerts: {
    lowStock: number;
    scheduledSoon: number;
    openReclamations: number;
    toVerify: number;
  };
}

function OverviewContent() {
  const router = useRouter();
  const { canAccessStore, hasPermission } = useAuth();
  const { stores } = useStores();
  const [selectedStoreIds, setSelectedStoreIds] = useState<string[]>([]);
  const [period, setPeriod] = useState<Period>(getPeriodRange("30d"));
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  const accessibleStores = stores.filter((s) => canAccessStore(s.id));

  useEffect(() => {
    if (stores.length > 0 && selectedStoreIds.length === 0) {
      setSelectedStoreIds(stores.map((s) => s.id));
    }
  }, [stores]);

  const fetchData = useCallback(async () => {
    if (selectedStoreIds.length === 0) return;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (period.from) params.set("from", period.from.toISOString());
      if (period.to) params.set("to", period.to.toISOString());
      params.set("storeIds", selectedStoreIds.join(","));

      const res = await fetch(`${API}/orders/stats/dashboard?${params}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      setData(await res.json());
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [period, selectedStoreIds]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const k = data?.kpis;
  const alerts = data?.alerts;

  const alertItems = [
    {
      show: (alerts?.toVerify ?? 0) > 0,
      count: alerts?.toVerify ?? 0,
      label: "commandes a verifier",
      icon: AlertTriangle,
      href: "/confirmation",
      tone: "bg-status-cancelled-bg text-status-cancelled",
    },
    {
      show: (alerts?.openReclamations ?? 0) > 0,
      count: alerts?.openReclamations ?? 0,
      label: "reclamations ouvertes",
      icon: MessageSquare,
      href: "/reclamation",
      tone: "bg-status-cancelled-bg text-status-cancelled",
    },
    {
      show: (alerts?.scheduledSoon ?? 0) > 0,
      count: alerts?.scheduledSoon ?? 0,
      label: "livraisons programmees",
      icon: Calendar,
      href: "/confirmation",
      tone: "bg-primary-soft text-primary",
    },
    {
      show: (alerts?.lowStock ?? 0) > 0,
      count: alerts?.lowStock ?? 0,
      label: "produits en stock bas",
      icon: Package,
      href: "/products",
      tone: "bg-status-processing-bg text-status-processing",
    },
  ].filter((a) => a.show);

  return (
    <div className="flex h-screen bg-background">
      <Sidebar
        stores={accessibleStores}
        selectedStoreIds={selectedStoreIds}
        onChangeSelectedStores={setSelectedStoreIds}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-surface px-5">
          <h1 className="text-base font-semibold">Vue d'ensemble</h1>
        </header>

        <div className="border-b border-border bg-surface px-5 py-3">
          <PeriodFilter period={period} onChange={setPeriod} />
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
        {!hasPermission("stats") ? (
            <div className="flex flex-col items-center justify-center py-24">
              <Lock className="h-8 w-8 text-muted-light" />
              <p className="mt-2 text-sm font-medium">Accès restreint</p>
              <p className="mt-1 text-center text-xs text-muted max-w-sm">
                Vous n'avez pas la permission de consulter les statistiques.
                Contactez votre administrateur.
              </p>
            </div>
          ) : loading && !data ? (
            <p className="py-24 text-center text-sm text-muted">Chargement...</p>
          ) : !data ? (
            <p className="py-24 text-center text-sm text-muted">Aucune donnee</p>
          ) : (
            <>
              {/* Alerts */}
              {alertItems.length > 0 && (
                <div className="grid grid-cols-4 gap-3">
                  {alertItems.map((a) => {
                    const Icon = a.icon;
                    return (
                      <button
                        key={a.label}
                        onClick={() => router.push(a.href)}
                        className={cn(
                          "flex items-center gap-3 rounded-xl px-4 py-3 text-left transition-opacity hover:opacity-80",
                          a.tone
                        )}
                      >
                        <Icon className="h-5 w-5 shrink-0" />
                        <div className="min-w-0">
                          <p className="text-lg font-bold leading-none">{a.count}</p>
                          <p className="mt-0.5 text-[11px] leading-tight">{a.label}</p>
                        </div>
                        <ArrowRight className="ml-auto h-3.5 w-3.5 shrink-0 opacity-60" />
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Revenue row */}
              <div className="grid grid-cols-4 gap-3">
                <KpiCard
                  label="CA encaisse"
                  value={money(k.revenue)}
                  suffix=" TND"
                  sub={`${k.paid} commandes payees`}
                  tone="green"
                />
                <KpiCard
                  label="En attente d'encaissement"
                  value={money(k.pendingRevenue)}
                  suffix=" TND"
                  sub="livrees non payees"
                  tone="orange"
                />
                <KpiCard
                  label="CA potentiel"
                  value={money(k.potentialRevenue)}
                  suffix=" TND"
                  sub="commandes en cours"
                  tone="blue"
                />
                <KpiCard
                  label="Panier moyen"
                  value={money(k.avgBasket)}
                  suffix=" TND"
                  sub="sur commandes payees"
                  tone="purple"
                />
              </div>

              {/* Rates row */}
              <div className="grid grid-cols-6 gap-3">
                <KpiCard label="Total commandes" value={k.total} tone="gray" />
                <KpiCard label="En attente" value={k.pending} tone="orange" />
                <KpiCard label="En cours" value={k.inProgress} tone="blue" />
                <KpiCard
                  label="Taux confirmation"
                  value={k.confirmationRate}
                  suffix="%"
                  sub={`${k.confirmed} confirmees`}
                  tone="green"
                />
                <KpiCard
                  label="Taux livraison"
                  value={k.deliveryRate}
                  suffix="%"
                  sub={`${k.delivered} livrees`}
                  tone="green"
                />
                <KpiCard
                  label="Taux retour"
                  value={k.returnRate}
                  suffix="%"
                  sub={`${k.returned} retours`}
                  tone="red"
                />
              </div>

              {/* Timeline */}
              <div className="rounded-xl border border-border bg-surface p-5">
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="flex items-center gap-2 text-sm font-semibold">
                    <TrendingUp className="h-4 w-4 text-muted" />
                    Evolution des commandes
                  </h2>
                  <div className="flex items-center gap-3 text-[11px] text-muted">
                    <span className="flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-primary-soft" /> Total
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-status-delivered" /> Livrees
                    </span>
                  </div>
                </div>
                <TimelineChart data={data.timeline} />
              </div>

              {/* Two columns */}
              <div className="grid grid-cols-2 gap-5">
                <div className="rounded-xl border border-border bg-surface p-5">
                  <h2 className="mb-4 text-sm font-semibold">Repartition par statut</h2>
                  <StatusBars counts={data.statusCounts} total={k.total} />
                </div>

                <div className="rounded-xl border border-border bg-surface p-5">
                  <div className="mb-4 flex items-center justify-between">
                    <h2 className="text-sm font-semibold">Performance livreurs</h2>
                    <span className="text-[10px] text-muted">taux · cmd · CA</span>
                  </div>
                  <CarrierTable carriers={data.carriers} />
                </div>
              </div>

              {/* Products + stores */}
              <div className="grid grid-cols-3 gap-5">
                <div className="col-span-2 rounded-xl border border-border bg-surface p-5">
                  <div className="mb-4 flex items-center justify-between">
                    <h2 className="text-sm font-semibold">Top produits</h2>
                    <button
                      onClick={() => router.push("/products")}
                      className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                    >
                      Voir tout <ArrowRight className="h-3 w-3" />
                    </button>
                  </div>
                  <TopProducts products={data.topProducts} />
                </div>

                <div className="rounded-xl border border-border bg-surface p-5">
                  <h2 className="mb-4 text-sm font-semibold">Par magasin</h2>
                  <div className="space-y-3">
                    {data.storeStats.map((s) => (
                      <div key={s.name}>
                        <div className="flex items-center justify-between text-xs">
                          <span className="truncate font-medium">{s.name}</span>
                          <span className="font-mono text-muted">{s.total}</span>
                        </div>
                        <p className="mt-0.5 font-mono text-[11px] text-status-delivered">
                          {money(s.revenue)} TND
                        </p>
                      </div>
                    ))}
                    {data.storeStats.length === 0 && (
                      <p className="text-xs text-muted">Aucune donnee</p>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function OverviewPage() {
  return (
    <RouteGuard>
      <OverviewContent />
    </RouteGuard>
  );
}