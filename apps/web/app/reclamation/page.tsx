"use client";

import { useState, useEffect, useCallback } from "react";
import { Sidebar } from "@/components/layout/sidebar";
import { RouteGuard } from "@/components/auth/route-guard";
import { useStores } from "@/lib/stores-context";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Search, ChevronLeft, ChevronRight, AlertCircle, X, Check } from "lucide-react";
import { Order } from "@/types/order";
import { TagBadge } from "@/components/orders/tag-picker";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api";

function getToken() {
  return window.localStorage.getItem("orderly_token");
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("fr-FR", {
    day: "numeric", month: "short", year: "numeric",
  });
}

function formatMoney(n: number, currency: string) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency }).format(n);
}

const RECLAMATION_STATUSES = [
  { value: "OUVERT", label: "Ouvert", color: "bg-status-cancelled-bg text-status-cancelled" },
  { value: "EN_COURS", label: "En cours", color: "bg-status-processing-bg text-status-processing" },
  { value: "RESOLU", label: "Résolu", color: "bg-status-delivered-bg text-status-delivered" },
];

const RECLAMATION_TYPES = [
  "Produit défectueux",
  "Mauvais produit",
  "Produit manquant",
  "Retard de livraison",
  "Remboursement",
  "Échange",
  "Autre",
];

interface Reclamation {
  orderId: string;
  status: "OUVERT" | "EN_COURS" | "RESOLU";
  type: string;
  note: string;
  assignedTo: string;
  createdAt: string;
}

function ReclamationModal({
  order,
  onClose,
  onSave,
}: {
  order: Order;
  onClose: () => void;
  onSave: (rec: Reclamation) => void;
}) {
  const [status, setStatus] = useState<"OUVERT" | "EN_COURS" | "RESOLU">("OUVERT");
  const [type, setType] = useState("");
  const [note, setNote] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const [loading, setLoading] = useState(false);

  // Check if order already has reclamation data in internalNote
  useEffect(() => {
    if (order.internalNote) {
      try {
        const data = JSON.parse(order.internalNote);
        if (data.reclamation) {
          setStatus(data.reclamation.status ?? "OUVERT");
          setType(data.reclamation.type ?? "");
          setNote(data.reclamation.note ?? "");
          setAssignedTo(data.reclamation.assignedTo ?? "");
        }
      } catch {}
    }
  }, [order]);

  async function save() {
    setLoading(true);
    try {
      const reclamation: Reclamation = {
        orderId: order.id,
        status,
        type,
        note,
        assignedTo,
        createdAt: new Date().toISOString(),
      };

      // Save reclamation data in internalNote as JSON
      let existing: any = {};
      try { existing = JSON.parse(order.internalNote ?? "{}"); } catch {}
      existing.reclamation = reclamation;

      await fetch(`${API}/orders/${order.id}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${getToken()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ internalNote: JSON.stringify(existing) }),
      });

      // Make sure Réclamation tag is on the order
      const tags = order.tags ?? [];
      if (!tags.includes("Réclamation")) {
        await fetch(`${API}/orders/${order.id}/tags`, {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${getToken()}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ tags: [...tags, "Réclamation"] }),
        });
      }

      onSave(reclamation);
      onClose();
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30 backdrop-blur-[2px]">
      <div className="w-full max-w-md rounded-xl border border-border bg-surface shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold">Réclamation — {order.orderNumber}</h2>
            <p className="text-xs text-muted">{order.customerName}</p>
          </div>
          <button onClick={onClose} className="rounded-md p-1 hover:bg-surface-sunken">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Status */}
          <div>
            <label className="mb-2 block text-xs font-medium text-muted">Statut</label>
            <div className="flex gap-2">
              {RECLAMATION_STATUSES.map((s) => (
                <button
                  key={s.value}
                  onClick={() => setStatus(s.value as any)}
                  className={cn(
                    "flex-1 rounded-lg border-2 py-2 text-xs font-medium transition-colors",
                    status === s.value
                      ? cn("border-current", s.color)
                      : "border-border text-muted hover:border-border-strong"
                  )}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* Type */}
          <div>
            <label className="mb-2 block text-xs font-medium text-muted">Type de réclamation</label>
            <div className="flex flex-wrap gap-1.5">
              {RECLAMATION_TYPES.map((t) => (
                <button
                  key={t}
                  onClick={() => setType(t)}
                  className={cn(
                    "rounded-full px-2.5 py-1 text-[11px] font-medium border transition-colors",
                    type === t
                      ? "border-primary bg-primary-soft text-primary"
                      : "border-border text-muted hover:border-border-strong"
                  )}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* Note */}
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">Description du problème</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Décrivez le problème..."
              rows={3}
              className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary resize-none"
            />
          </div>

          {/* Assigned to */}
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">Assigné à</label>
            <Input
              value={assignedTo}
              onChange={(e) => setAssignedTo(e.target.value)}
              placeholder="Nom de l'agent responsable..."
            />
          </div>
        </div>

        <div className="flex gap-2 border-t border-border px-5 py-4">
          <Button variant="secondary" className="flex-1" onClick={onClose}>Annuler</Button>
          <Button className="flex-1" disabled={loading || !type} onClick={save}>
            <Check className="h-3.5 w-3.5" />
            {loading ? "Sauvegarde..." : "Sauvegarder"}
          </Button>
        </div>
      </div>
    </div>
  );
}

const PAGE_SIZE = 25;

function ReclamationContent() {
  const { canAccessStore } = useAuth();
  const { stores } = useStores();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedStoreIds, setSelectedStoreIds] = useState<string[]>([]);
  const [activeOrder, setActiveOrder] = useState<Order | null>(null);
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState<"all" | "OUVERT" | "EN_COURS" | "RESOLU">("all");

  const accessibleStores = stores.filter((s) => canAccessStore(s.id));

  useEffect(() => {
    if (stores.length > 0 && selectedStoreIds.length === 0) {
      setSelectedStoreIds(stores.map((s) => s.id));
    }
  }, [stores]);

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      const token = getToken();
      const res = await fetch(`${API}/orders?pageSize=200`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      const all: Order[] = data.orders ?? [];
      // Only show orders tagged with Réclamation
      setOrders(all.filter((o) => (o.tags ?? []).includes("Réclamation")));
    } catch {
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  function getReclamation(order: Order): Reclamation | null {
    try {
      const data = JSON.parse(order.internalNote ?? "{}");
      return data.reclamation ?? null;
    } catch {
      return null;
    }
  }

  const filtered = orders.filter((o) => {
    if (!selectedStoreIds.includes(o.storeId)) return false;
    if (search) {
      const q = search.toLowerCase();
      const hay = `${o.orderNumber} ${o.customerName ?? ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (filter !== "all") {
      const rec = getReclamation(o);
      if (!rec || rec.status !== filter) return false;
    }
    return true;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageOrders = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const ouvertCount = orders.filter((o) => getReclamation(o)?.status === "OUVERT" || !getReclamation(o)).length;
  const enCoursCount = orders.filter((o) => getReclamation(o)?.status === "EN_COURS").length;
  const resoluCount = orders.filter((o) => getReclamation(o)?.status === "RESOLU").length;

  return (
    <div className="flex h-screen bg-background">
      <Sidebar
        stores={accessibleStores}
        selectedStoreIds={selectedStoreIds}
        onChangeSelectedStores={setSelectedStoreIds}
      />

      <div className="flex min-w-0 flex-1 flex-col pt-14 md:pt-0">
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-surface px-5">
          <h1 className="text-base font-semibold">Réclamations</h1>
          <p className="text-xs text-muted">{orders.length} réclamations</p>
        </header>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 border-b border-border bg-surface p-4">
          <div className="rounded-lg bg-status-cancelled-bg px-4 py-3">
            <p className="text-xs font-medium text-status-cancelled">Ouvertes</p>
            <p className="mt-1 text-2xl font-bold text-status-cancelled">{ouvertCount}</p>
          </div>
          <div className="rounded-lg bg-status-processing-bg px-4 py-3">
            <p className="text-xs font-medium text-status-processing">En cours</p>
            <p className="mt-1 text-2xl font-bold text-status-processing">{enCoursCount}</p>
          </div>
          <div className="rounded-lg bg-status-delivered-bg px-4 py-3">
            <p className="text-xs font-medium text-status-delivered">Résolues</p>
            <p className="mt-1 text-2xl font-bold text-status-delivered">{resoluCount}</p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 border-b border-border bg-surface px-5 py-3">
          <div className="relative w-64">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-light" />
            <Input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="Rechercher..."
              className="pl-8"
            />
          </div>
          <div className="flex gap-1">
            {[
              { key: "all", label: "Tous", count: orders.length },
              { key: "OUVERT", label: "Ouvertes", count: ouvertCount },
              { key: "EN_COURS", label: "En cours", count: enCoursCount },
              { key: "RESOLU", label: "Résolues", count: resoluCount },
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => { setFilter(tab.key as any); setPage(1); }}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                  filter === tab.key ? "bg-primary-soft text-primary" : "text-muted hover:bg-surface-sunken"
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

        {/* Table */}
        <div className="flex-1 overflow-auto">
          {loading ? (
            <div className="flex items-center justify-center py-24">
              <p className="text-sm text-muted">Chargement...</p>
            </div>
          ) : (
            <table className="w-full border-collapse text-sm">
              <thead className="sticky top-0 z-10 bg-surface">
                <tr className="border-b border-border text-left text-xs font-medium text-muted">
                  <th className="px-4 py-2.5">Commande</th>
                  <th className="px-4 py-2.5">Date</th>
                  <th className="px-4 py-2.5">Client</th>
                  <th className="px-4 py-2.5">Total</th>
                  <th className="px-4 py-2.5">Type</th>
                  <th className="px-4 py-2.5">Problème</th>
                  <th className="px-4 py-2.5">Assigné à</th>
                  <th className="px-4 py-2.5">Tags</th>
                  <th className="px-4 py-2.5">Statut</th>
                  <th className="px-4 py-2.5">Action</th>
                </tr>
              </thead>
              <tbody>
                {pageOrders.map((order) => {
                  const rec = getReclamation(order);
                  const recStatus = rec?.status ?? "OUVERT";
                  const statusInfo = RECLAMATION_STATUSES.find((s) => s.value === recStatus);

                  return (
                    <tr key={order.id} className="border-b border-border transition-colors hover:bg-surface-sunken">
                      <td className="px-4 py-3">
                        <span className="font-mono text-[13px] font-semibold">{order.orderNumber}</span>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted whitespace-nowrap">
                        {formatDate(order.sourceCreatedAt)}
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium">{order.customerName ?? "—"}</p>
                        <p className="text-xs text-muted font-mono">{order.customerPhone}</p>
                      </td>
                      <td className="px-4 py-3 font-mono text-sm font-medium">
                        {formatMoney(order.total, order.currency)}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {rec?.type ?? <span className="text-muted">—</span>}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted max-w-[200px]">
                        <p className="truncate">{rec?.note ?? "—"}</p>
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {rec?.assignedTo ?? <span className="text-muted">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {(order.tags ?? []).map((t) => (
                            <TagBadge key={t} tag={t} />
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={cn("rounded px-2 py-1 text-xs font-medium", statusInfo?.color ?? "")}>
                          {statusInfo?.label ?? recStatus}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <Button size="sm" variant="secondary" onClick={() => setActiveOrder(order)}>
                          <AlertCircle className="h-3.5 w-3.5" />
                          Gérer
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}

          {!loading && pageOrders.length === 0 && (
            <div className="flex flex-col items-center justify-center py-24">
              <AlertCircle className="h-8 w-8 text-muted-light" />
              <p className="mt-2 text-sm font-medium">Aucune réclamation</p>
              <p className="mt-1 text-xs text-muted">Les commandes taguées "Réclamation" apparaîtront ici.</p>
            </div>
          )}
        </div>

        <footer className="flex shrink-0 items-center justify-between border-t border-border bg-surface px-5 py-2.5">
          <p className="text-xs text-muted">{filtered.length} réclamations</p>
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

      {activeOrder && (
        <ReclamationModal
          order={activeOrder}
          onClose={() => setActiveOrder(null)}
          onSave={() => {
            fetchOrders();
            setActiveOrder(null);
          }}
        />
      )}
    </div>
  );
}

export default function ReclamationPage() {
  return (
    <RouteGuard>
      <ReclamationContent />
    </RouteGuard>
  );
}
