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
  Search, ChevronLeft, ChevronRight, Archive,
  RotateCcw, X, History, User, Clock,
} from "lucide-react";
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

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("fr-FR", {
    day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function formatMoney(n: number, currency: string) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency }).format(n);
}

const PAGE_SIZE = 25;

const EVENT_LABELS: Record<string, string> = {
  order_created_manual: "Commande créée manuellement",
  status_changed: "Statut changé",
  order_edited: "Commande modifiée",
  tags_updated: "Tags mis à jour",
  refund_issued: "Remboursement émis",
  webhook_received: "Reçue depuis Shopify",
};

const STATUS_LABELS_SHORT: Record<string, string> = {
  NOUVEAU: "Nouveau",
  CONFIRMATION_EN_COURS: "Confirmation en cours",
  CONFIRME: "Confirmé",
  ECHANGE: "Échange",
  A_PREPARER: "À préparer",
  EN_PREPARATION: "En préparation",
  IMPRIME: "Imprimé",
  EMBALLE: "Emballé",
  A_EXPEDIER: "À expédier",
  AU_DEPOT_LIVREUR: "Au dépôt livreur",
  EN_COURS_DE_LIVRAISON: "En cours de livraison",
  LIVRE: "Livré",
  PAYE: "Payé",
  RETOUR: "Retour",
  RETOUR_DEPOT: "Retour dépôt",
  RETOUR_RECU: "Retour reçu",
  ANNULE: "Annulé",
  A_VERIFIER: "À vérifier",
  ARCHIVE: "Archivé",
};

interface OrderEvent {
  id: string;
  eventType: string;
  payload: any;
  actor: string | null;
  actorName: string;
  actorEmail: string | null;
  createdAt: string;
}

function HistoryModal({
  order,
  onClose,
}: {
  order: Order;
  onClose: () => void;
}) {
  const [events, setEvents] = useState<OrderEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API}/orders/${order.id}/events`, {
          headers: { Authorization: `Bearer ${getToken()}` },
        });
        const data = await res.json();
        setEvents(Array.isArray(data) ? data : []);
      } catch {
        setEvents([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [order.id]);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-foreground/30 backdrop-blur-[2px]">
      <div className="w-full max-w-lg rounded-xl border border-border bg-surface shadow-2xl max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <History className="h-4 w-4" />
              Historique — {order.orderNumber}
            </h2>
            <p className="text-xs text-muted">{order.customerName}</p>
          </div>
          <button onClick={onClose} className="rounded-md p-1 hover:bg-surface-sunken">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {loading ? (
            <p className="text-center text-sm text-muted py-8">Chargement...</p>
          ) : events.length === 0 ? (
            <p className="text-center text-sm text-muted py-8">Aucun événement enregistré</p>
          ) : (
            <div className="relative space-y-0">
              {events.map((e, i) => (
                <div key={e.id} className="relative flex gap-3 pb-5 last:pb-0">
                  {/* Timeline line */}
                  {i < events.length - 1 && (
                    <div className="absolute left-[11px] top-6 h-full w-px bg-border" />
                  )}
                  {/* Dot */}
                  <div className={cn(
                    "relative z-10 mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full",
                    e.payload?.to === "ARCHIVE"
                      ? "bg-status-cancelled-bg"
                      : e.eventType === "order_created_manual"
                      ? "bg-primary-soft"
                      : "bg-surface-sunken"
                  )}>
                    {e.payload?.to === "ARCHIVE" ? (
                      <Archive className="h-3 w-3 text-status-cancelled" />
                    ) : (
                      <Clock className="h-3 w-3 text-muted" />
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold">
                      {EVENT_LABELS[e.eventType] ?? e.eventType}
                      {e.payload?.to && (
                        <span className="ml-1 font-normal text-muted">
                          → {STATUS_LABELS_SHORT[e.payload.to] ?? e.payload.to}
                        </span>
                      )}
                    </p>
                    {e.payload?.reason && (
                      <p className="mt-0.5 text-[11px] text-muted">Raison : {e.payload.reason}</p>
                    )}
                    {e.payload?.fields && (
                      <p className="mt-0.5 text-[11px] text-muted">
                        Champs : {e.payload.fields.join(", ")}
                      </p>
                    )}
                    <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-light">
                      <span className="flex items-center gap-1">
                        <User className="h-2.5 w-2.5" />
                        {e.actorName}
                      </span>
                      <span>·</span>
                      <span>{formatDateTime(e.createdAt)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="border-t border-border px-5 py-4">
          <Button variant="secondary" className="w-full" onClick={onClose}>Fermer</Button>
        </div>
      </div>
    </div>
  );
}

function RestoreModal({
  order,
  count,
  onClose,
  onConfirm,
}: {
  order?: Order;
  count?: number;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const isBulk = !order && count !== undefined;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-foreground/30 backdrop-blur-[2px]">
      <div className="w-full max-w-sm rounded-xl border border-border bg-surface shadow-2xl">
        <div className="flex items-center gap-2.5 border-b border-border px-5 py-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-soft">
            <RotateCcw className="h-4 w-4 text-primary" />
          </div>
          <h2 className="text-sm font-semibold">
            {isBulk ? `Restaurer ${count} commandes ?` : "Restaurer la commande ?"}
          </h2>
        </div>

        <div className="space-y-3 p-5">
          {order && (
            <div className="rounded-lg bg-surface-sunken px-3 py-2.5">
              <p className="font-mono text-sm font-semibold">{order.orderNumber}</p>
              <p className="mt-0.5 text-xs text-muted">
                {order.customerName ?? "—"} · {formatMoney(order.total, order.currency)}
              </p>
            </div>
          )}
          <p className="text-xs text-muted leading-relaxed">
            {isBulk ? "Les commandes seront restaurées" : "La commande sera restaurée"} avec
            le statut <strong className="text-foreground">Nouveau</strong> et
            {isBulk ? " réapparaîtront" : " réapparaîtra"} dans la page Confirmation.
          </p>
        </div>

        <div className="flex gap-2 border-t border-border px-5 py-4">
          <Button variant="secondary" className="flex-1" onClick={onClose}>Annuler</Button>
          <Button className="flex-1" onClick={onConfirm}>
            <RotateCcw className="h-3.5 w-3.5" />
            Restaurer
          </Button>
        </div>
      </div>
    </div>
  );
}

function ArchivesContent() {
  const { canAccessStore } = useAuth();
  const { stores } = useStores();
  const [orders, setOrders] = useState<Order[]>([]);
  const [archiveInfo, setArchiveInfo] = useState<Record<string, { by: string; at: string }>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedStoreIds, setSelectedStoreIds] = useState<string[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const [restoreOrder, setRestoreOrder] = useState<Order | null>(null);
  const [showBulkRestore, setShowBulkRestore] = useState(false);
  const [historyOrder, setHistoryOrder] = useState<Order | null>(null);

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
      const archived = all.filter((o) => o.orderStatus === "ARCHIVE");
      setOrders(archived);

      // Fetch who archived each order
      const info: Record<string, { by: string; at: string }> = {};
      await Promise.all(
        archived.map(async (o) => {
          try {
            const r = await fetch(`${API}/orders/${o.id}/events`, {
              headers: { Authorization: `Bearer ${token}` },
            });
            const events: OrderEvent[] = await r.json();
            const archiveEvent = events.find(
              (e) => e.eventType === "status_changed" && e.payload?.to === "ARCHIVE"
            );
            if (archiveEvent) {
              info[o.id] = { by: archiveEvent.actorName, at: archiveEvent.createdAt };
            }
          } catch {}
        })
      );
      setArchiveInfo(info);
    } catch {
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  async function restore(orderId: string) {
    setOrders((prev) => prev.filter((o) => o.id !== orderId));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.delete(orderId);
      return next;
    });
    await fetch(`${API}/orders/${orderId}/status`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${getToken()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ status: "NOUVEAU" }),
    });
  }

  async function restoreBulk() {
    const ids = Array.from(selectedIds);
    setOrders((prev) => prev.filter((o) => !selectedIds.has(o.id)));
    setSelectedIds(new Set());
    await fetch(`${API}/orders/bulk/status`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${getToken()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ orderIds: ids, status: "NOUVEAU" }),
    });
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    const pageIds = pageOrders.map((o) => o.id);
    const allSelected = pageIds.length > 0 && pageIds.every((id) => selectedIds.has(id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allSelected) pageIds.forEach((id) => next.delete(id));
      else pageIds.forEach((id) => next.add(id));
      return next;
    });
  }

  const filtered = orders.filter((o) => {
    if (!selectedStoreIds.includes(o.storeId)) return false;
    if (search) {
      const q = search.toLowerCase();
      const archivedBy = archiveInfo[o.id]?.by ?? "";
      const hay = `${o.orderNumber} ${o.customerName ?? ""} ${o.customerPhone ?? ""} ${archivedBy}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageOrders = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const totalValue = orders.reduce((s, o) => s + Number(o.total), 0);

  return (
    <div className="flex h-screen bg-background">
      <Sidebar
        stores={accessibleStores}
        selectedStoreIds={selectedStoreIds}
        onChangeSelectedStores={setSelectedStoreIds}
      />

      <div className="flex min-w-0 flex-1 flex-col pt-14 md:pt-0">
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-surface px-5">
          <h1 className="text-base font-semibold">Archives</h1>
          <div className="flex items-center gap-2">
            {selectedIds.size > 0 && (
              <Button size="sm" onClick={() => setShowBulkRestore(true)}>
                <RotateCcw className="h-3.5 w-3.5" />
                Restaurer {selectedIds.size} commande{selectedIds.size > 1 ? "s" : ""}
              </Button>
            )}
            <p className="text-xs text-muted">{orders.length} commandes archivées</p>
          </div>
        </header>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 border-b border-border bg-surface p-4">
          <div className="rounded-lg bg-surface-sunken px-4 py-3">
            <p className="text-xs font-medium text-muted">Total archivées</p>
            <p className="mt-1 text-2xl font-bold">{orders.length}</p>
          </div>
          <div className="rounded-lg bg-surface-sunken px-4 py-3">
            <p className="text-xs font-medium text-muted">Valeur totale</p>
            <p className="mt-1 text-2xl font-bold font-mono">
              {totalValue.toLocaleString("fr-FR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })} TND
            </p>
          </div>
          <div className="rounded-lg bg-surface-sunken px-4 py-3">
            <p className="text-xs font-medium text-muted">Sélectionnées</p>
            <p className="mt-1 text-2xl font-bold text-primary">{selectedIds.size}</p>
          </div>
        </div>

        {/* Search */}
        <div className="border-b border-border bg-surface px-5 py-3">
          <div className="relative w-80">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-light" />
            <Input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="Rechercher commande, client, téléphone, archivé par..."
              className="pl-8"
            />
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
                  <th className="w-10 px-4 py-2.5">
                    <input
                      type="checkbox"
                      checked={pageOrders.length > 0 && pageOrders.every((o) => selectedIds.has(o.id))}
                      onChange={toggleSelectAll}
                      className="h-3.5 w-3.5 rounded border-border-strong accent-primary"
                    />
                  </th>
                  <th className="px-4 py-2.5">Commande</th>
                  <th className="px-4 py-2.5">Date commande</th>
                  <th className="px-4 py-2.5">Archivé par</th>
                  <th className="px-4 py-2.5">Client</th>
                  <th className="px-4 py-2.5">Téléphone</th>
                  <th className="px-4 py-2.5">Produits</th>
                  <th className="px-4 py-2.5">Total</th>
                  <th className="px-4 py-2.5">Tags</th>
                  <th className="px-4 py-2.5">Actions</th>
                </tr>
              </thead>
              <tbody>
                {pageOrders.map((order) => {
                  const info = archiveInfo[order.id];
                  return (
                    <tr
                      key={order.id}
                      className={cn(
                        "border-b border-border transition-colors hover:bg-surface-sunken",
                        selectedIds.has(order.id) && "bg-primary-soft/30"
                      )}
                    >
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(order.id)}
                          onChange={() => toggleSelect(order.id)}
                          className="h-3.5 w-3.5 rounded border-border-strong accent-primary"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-mono text-[13px] font-semibold">{order.orderNumber}</span>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted whitespace-nowrap">
                        {formatDate(order.sourceCreatedAt)}
                      </td>
                      <td className="px-4 py-3">
                        {info ? (
                          <div>
                            <p className="text-xs font-medium flex items-center gap-1">
                              <User className="h-3 w-3 text-muted" />
                              {info.by}
                            </p>
                            <p className="text-[11px] text-muted">{formatDateTime(info.at)}</p>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-light">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium truncate max-w-[130px]">{order.customerName ?? "—"}</p>
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-mono text-xs">{order.customerPhone ?? "—"}</span>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted">
                        {order.lineItems?.map((li) => (
                          <div key={li.id} className="truncate max-w-[160px]">
                            {li.title} × {li.quantity}
                          </div>
                        ))}
                      </td>
                      <td className="px-4 py-3 font-mono text-sm font-medium">
                        {formatMoney(order.total, order.currency)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1 max-w-[130px]">
                          {(order.tags ?? []).map((t) => (
                            <TagBadge key={t} tag={t} />
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <Button size="sm" variant="secondary" onClick={() => setRestoreOrder(order)}>
                            <RotateCcw className="h-3.5 w-3.5" />
                            Restaurer
                          </Button>
                          <button
                            onClick={() => setHistoryOrder(order)}
                            className="rounded-md p-1.5 text-muted hover:bg-surface-sunken hover:text-foreground"
                            title="Historique"
                          >
                            <History className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}

          {!loading && pageOrders.length === 0 && (
            <div className="flex flex-col items-center justify-center py-24">
              <Archive className="h-8 w-8 text-muted-light" />
              <p className="mt-2 text-sm font-medium">Aucune commande archivée</p>
              <p className="mt-1 text-xs text-muted">
                Les commandes archivées depuis Confirmation ou Préparation apparaîtront ici.
              </p>
            </div>
          )}
        </div>

        <footer className="flex shrink-0 items-center justify-between border-t border-border bg-surface px-5 py-2.5">
          <p className="text-xs text-muted">
            {filtered.length} commandes
            {selectedIds.size > 0 && ` · ${selectedIds.size} sélectionnée${selectedIds.size > 1 ? "s" : ""}`}
          </p>
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

      {restoreOrder && (
        <RestoreModal
          order={restoreOrder}
          onClose={() => setRestoreOrder(null)}
          onConfirm={() => {
            restore(restoreOrder.id);
            setRestoreOrder(null);
          }}
        />
      )}

      {showBulkRestore && (
        <RestoreModal
          count={selectedIds.size}
          onClose={() => setShowBulkRestore(false)}
          onConfirm={() => {
            restoreBulk();
            setShowBulkRestore(false);
          }}
        />
      )}

      {historyOrder && (
        <HistoryModal
          order={historyOrder}
          onClose={() => setHistoryOrder(null)}
        />
      )}
    </div>
  );
}

export default function ArchivesPage() {
  return (
    <RouteGuard>
      <ArchivesContent />
    </RouteGuard>
  );
}