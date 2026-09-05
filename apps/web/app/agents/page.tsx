"use client";

import { useState, useEffect, useCallback } from "react";
import { Sidebar } from "@/components/layout/sidebar";
import { RouteGuard } from "@/components/auth/route-guard";
import { useStores } from "@/lib/stores-context";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";
import { Users, TrendingUp, Phone, Trophy } from "lucide-react";
import {
  PeriodFilter,
  getPeriodRange,
  type Period,
} from "@/components/stats/period-filter";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api";

function getToken() {
  return window.localStorage.getItem("orderly_token");
}

interface AgentStat {
  agentId: string;
  agentName: string;
  total: number;
  confirmed: number;
  refused: number;
  pending: number;
  revenue: number;
  confirmationRate: number;
  refusalRate: number;
  avgAttempts: number;
}

function AgentsContent() {
  const { canAccessStore } = useAuth();
  const { stores } = useStores();
  const [agents, setAgents] = useState<AgentStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedStoreIds, setSelectedStoreIds] = useState<string[]>([]);
  const [period, setPeriod] = useState<Period>(getPeriodRange("30d"));

  const accessibleStores = stores.filter((s) => canAccessStore(s.id));

  useEffect(() => {
    if (stores.length > 0 && selectedStoreIds.length === 0) {
      setSelectedStoreIds(stores.map((s) => s.id));
    }
  }, [stores]);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (period.from) params.set("from", period.from.toISOString());
      if (period.to) params.set("to", period.to.toISOString());
      if (selectedStoreIds.length) params.set("storeIds", selectedStoreIds.join(","));

      const res = await fetch(`${API}/orders/stats/agents?${params}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const data = await res.json();
      setAgents(Array.isArray(data) ? data : []);
    } catch {
      setAgents([]);
    } finally {
      setLoading(false);
    }
  }, [period, selectedStoreIds]);

  useEffect(() => {
    if (selectedStoreIds.length > 0) fetchStats();
  }, [fetchStats, selectedStoreIds]);

  const totalOrders = agents.reduce((s, a) => s + a.total, 0);
  const totalRevenue = agents.reduce((s, a) => s + a.revenue, 0);
  const avgConfirmation =
    agents.length > 0
      ? Math.round(agents.reduce((s, a) => s + a.confirmationRate, 0) / agents.length)
      : 0;

  const best = agents.length > 0
    ? [...agents].sort((a, b) => b.confirmationRate - a.confirmationRate)[0]
    : null;

  const maxTotal = Math.max(...agents.map((a) => a.total), 1);

  return (
    <div className="flex h-screen bg-background">
      <Sidebar
        stores={accessibleStores}
        selectedStoreIds={selectedStoreIds}
        onChangeSelectedStores={setSelectedStoreIds}
      />

      <div className="flex min-w-0 max-w-full flex-1 flex-col overflow-x-hidden pt-14 md:pt-0">
        <header className="flex min-h-14 w-full max-w-full shrink-0 flex-wrap items-center justify-between gap-2 overflow-hidden border-b border-border bg-surface px-3 py-2 md:h-14 md:flex-nowrap md:px-5 md:py-0">
          <h1 className="text-base font-semibold">Performance agents</h1>
          <p className="text-xs text-muted">{agents.length} agents actifs</p>
        </header>

        {/* Period */}
        <div className="border-b border-border bg-surface px-5 py-3">
          <PeriodFilter period={period} onChange={setPeriod} />
        </div>

        {/* Global stats */}
        <div className="grid grid-cols-4 gap-3 border-b border-border bg-surface p-4">
          <div className="rounded-lg bg-surface-sunken px-4 py-3">
            <p className="text-[11px] font-medium text-muted">Commandes traitées</p>
            <p className="mt-1 text-2xl font-bold">{totalOrders}</p>
          </div>
          <div className="rounded-lg bg-status-delivered-bg px-4 py-3">
            <p className="text-[11px] font-medium text-status-delivered">Taux moyen confirmation</p>
            <p className="mt-1 text-2xl font-bold text-status-delivered">{avgConfirmation}%</p>
          </div>
          <div className="rounded-lg bg-primary-soft px-4 py-3">
            <p className="text-[11px] font-medium text-primary">CA généré</p>
            <p className="mt-1 text-2xl font-bold text-primary font-mono">
              {totalRevenue.toLocaleString("fr-FR", { maximumFractionDigits: 0 })}
            </p>
          </div>
          <div className="rounded-lg bg-purple-50 px-4 py-3">
            <p className="text-[11px] font-medium text-purple-600 flex items-center gap-1">
              <Trophy className="h-3 w-3" /> Meilleur agent
            </p>
            <p className="mt-1 text-sm font-bold text-purple-700 truncate">
              {best?.agentName ?? "—"}
            </p>
            {best && (
              <p className="text-[11px] text-purple-600">{best.confirmationRate}% confirmation</p>
            )}
          </div>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto p-5">
          {loading ? (
            <p className="py-16 text-center text-sm text-muted">Chargement...</p>
          ) : agents.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24">
              <Users className="h-8 w-8 text-muted-light" />
              <p className="mt-2 text-sm font-medium">Aucune donnée</p>
              <p className="mt-1 text-xs text-muted">
                Les statistiques apparaîtront quand les agents traiteront des commandes.
              </p>
            </div>
          ) : (
            <div className="rounded-xl border border-border bg-surface overflow-hidden">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border bg-surface-sunken text-left text-xs font-medium text-muted">
                    <th className="px-5 py-3">Agent</th>
                    <th className="px-4 py-3">Traitées</th>
                    <th className="px-4 py-3">Confirmées</th>
                    <th className="px-4 py-3">Refusées</th>
                    <th className="px-4 py-3">En attente</th>
                    <th className="px-4 py-3">Taux confirmation</th>
                    <th className="px-4 py-3">Moy. tentatives</th>
                    <th className="px-4 py-3">CA généré</th>
                  </tr>
                </thead>
                <tbody>
                  {agents.map((a, i) => (
                    <tr key={a.agentId} className="border-b border-border hover:bg-surface-sunken transition-colors">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <div className={cn(
                            "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white",
                            i === 0 ? "bg-purple-600" : "bg-primary"
                          )}>
                            {a.agentName[0]?.toUpperCase()}
                          </div>
                          <div>
                            <p className="text-sm font-medium">{a.agentName}</p>
                            {i === 0 && (
                              <p className="flex items-center gap-1 text-[10px] font-medium text-purple-600">
                                <Trophy className="h-2.5 w-2.5" /> Top performer
                              </p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm font-semibold">{a.total}</span>
                          <div className="h-1.5 w-16 rounded-full bg-surface-sunken">
                            <div
                              className="h-1.5 rounded-full bg-primary"
                              style={{ width: `${(a.total / maxTotal) * 100}%` }}
                            />
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="rounded px-2 py-1 text-xs font-medium bg-status-delivered-bg text-status-delivered">
                          {a.confirmed}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="rounded px-2 py-1 text-xs font-medium bg-status-cancelled-bg text-status-cancelled">
                          {a.refused}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="rounded px-2 py-1 text-xs font-medium bg-status-processing-bg text-status-processing">
                          {a.pending}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className={cn(
                            "font-mono text-sm font-bold",
                            a.confirmationRate >= 70 ? "text-status-delivered" :
                            a.confirmationRate >= 40 ? "text-status-processing" :
                            "text-status-cancelled"
                          )}>
                            {a.confirmationRate}%
                          </span>
                          <div className="h-1.5 w-16 rounded-full bg-surface-sunken">
                            <div
                              className={cn(
                                "h-1.5 rounded-full",
                                a.confirmationRate >= 70 ? "bg-status-delivered" :
                                a.confirmationRate >= 40 ? "bg-status-processing" :
                                "bg-status-cancelled"
                              )}
                              style={{ width: `${a.confirmationRate}%` }}
                            />
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="flex items-center gap-1 text-xs text-muted">
                          <Phone className="h-3 w-3" />
                          {a.avgAttempts}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-mono text-sm font-semibold">
                          {a.revenue.toLocaleString("fr-FR", { maximumFractionDigits: 0 })} TND
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function AgentsPage() {
  return (
    <RouteGuard>
      <AgentsContent />
    </RouteGuard>
  );
}