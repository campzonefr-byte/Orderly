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
  Search, ChevronLeft, ChevronRight, Package,
  QrCode, CheckCircle2, X, RotateCcw,
} from "lucide-react";
import { Order, OrderStatus } from "@/types/order";

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

function ScanRetourModal({
  onClose,
  onScanned,
}: {
  onClose: () => void;
  onScanned: (orderId: string) => void;
}) {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleScan() {
    if (!input.trim()) return;
    setLoading(true);
    setError("");
    try {
      const parsed = JSON.parse(input.trim());
      if (!parsed.orderId) throw new Error("Invalid QR");
      onScanned(parsed.orderId);
      onClose();
    } catch {
      setError("QR code invalide. Assurez-vous de scanner le bon bordereau.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30 backdrop-blur-[2px]">
      <div className="w-full max-w-md rounded-xl border border-border bg-surface shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <QrCode className="h-4 w-4" />
            Scanner retour reçu
          </h2>
          <button onClick={onClose} className="rounded-md p-1 hover:bg-surface-sunken">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="flex flex-col items-center gap-3 py-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-status-refunded-bg">
              <RotateCcw className="h-8 w-8 text-status-refunded" />
            </div>
            <p className="text-sm font-medium text-center">
              Scannez le QR code du bordereau retour
            </p>
            <p className="text-xs text-muted text-center">
              Quand le colis est retourné à votre dépôt
            </p>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-muted">
              Données QR (scanner USB ou saisie manuelle)
            </label>
            <div className="flex gap-2">
              <input
                autoFocus
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleScan()}
                placeholder='{"orderId":"...","orderNumber":"#27597",...}'
                className="flex-1 rounded-md border border-border bg-surface-sunken px-3 py-2 text-xs font-mono focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              />
              <Button size="sm" onClick={handleScan} disabled={!input.trim() || loading}>
                Valider
              </Button>
            </div>
          </div>

          {error && (
            <p className="rounded-md bg-status-cancelled-bg px-3 py-2 text-xs font-medium text-status-cancelled">
              {error}
            </p>
          )}
        </div>

        <div className="border-t border-border px-5 py-4">
          <Button variant="secondary" className="w-full" onClick={onClose}>Annuler</Button>
        </div>
      </div>
    </div>
  );
}

const PAGE_SIZE = 25;

const RETURN_STATUS_KEYS: OrderStatus[] = ["RETOUR", "RETOUR_DEPOT", "RETOUR_RECU"];

const STATUS_STYLE: Record<string, string> = {
  RETOUR: "bg-status-refunded-bg text-status-refunded",
  RETOUR_DEPOT: "bg-status-refunded-bg text-status-refunded",
  RETOUR_RECU: "bg-status-delivered-bg text-status-delivered",
};

const STATUS_LABEL: Record<string, string> = {
  RETOUR: "Retour",
  RETOUR_DEPOT: "Retour dépôt",
  RETOUR_RECU: "Retour reçu",
};

function RetoursContent() {
  const { canAccessStore } = useAuth();
  const { stores } = useStores();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedStoreIds, setSelectedStoreIds] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState<"all" | "RETOUR" | "RETOUR_DEPOT" | "RETOUR_RECU">("all");
  const [showScanner, setShowScanner] = useState(false);
  const [successOrder, setSuccessOrder] = useState<string | null>(null);

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
      setOrders(all.filter((o) => RETURN_STATUS_KEYS.includes(o.orderStatus)));
    } catch {
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  async function handleScanned(orderId: string) {
    try {
      await fetch(`${API}/orders/${orderId}/status`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${getToken()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status: "RETOUR_RECU" }),
      });
      setSuccessOrder(orderId);
      fetchOrders();
      setTimeout(() => setSuccessOrder(null), 3000);
    } catch (e) {
      console.error(e);
    }
  }

  async function markRetourRecu(orderId: string) {
    await fetch(`${API}/orders/${orderId}/status`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${getToken()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ status: "RETOUR_RECU" }),
    });
    setOrders((prev) =>
      prev.map((o) => o.id === orderId ? { ...o, orderStatus: "RETOUR_RECU" } : o)
    );
  }

  const filtered = orders.filter((o) => {
    if (!selectedStoreIds.includes(o.storeId)) return false;
    if (filter !== "all" && o.orderStatus !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      const hay = `${o.orderNumber} ${o.customerName ?? ""} ${o.customerPhone ?? ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageOrders = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const retourCount = orders.filter((o) => o.orderStatus === "RETOUR").length;
  const depotCount = orders.filter((o) => o.orderStatus === "RETOUR_DEPOT").length;
  const recuCount = orders.filter((o) => o.orderStatus === "RETOUR_RECU").length;

  return (
    <div className="flex h-screen bg-background">
      <Sidebar
        stores={accessibleStores}
        selectedStoreIds={selectedStoreIds}
        onChangeSelectedStores={setSelectedStoreIds}
      />

      <div className="flex min-w-0 max-w-full flex-1 flex-col overflow-x-hidden pt-14 md:pt-0">
        <header className="flex min-h-14 w-full max-w-full shrink-0 flex-wrap items-center justify-between gap-2 overflow-hidden border-b border-border bg-surface px-3 py-2 md:h-14 md:flex-nowrap md:px-5 md:py-0">
          <h1 className="text-base font-semibold">Retours</h1>
          <Button size="sm" onClick={() => setShowScanner(true)}>
            <QrCode className="h-3.5 w-3.5" />
            Scanner retour
          </Button>
        </header>

        {/* Success banner */}
        {successOrder && (
          <div className="flex items-center gap-3 border-b border-status-delivered/30 bg-status-delivered-bg px-5 py-3">
            <CheckCircle2 className="h-5 w-5 text-status-delivered" />
            <p className="text-sm font-medium text-status-delivered">
              Retour reçu enregistré avec succès !
            </p>
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 border-b border-border bg-surface p-4">
          <div className="rounded-lg bg-status-refunded-bg px-4 py-3">
            <p className="text-xs font-medium text-status-refunded">En retour</p>
            <p className="mt-1 text-2xl font-bold text-status-refunded">{retourCount}</p>
          </div>
          <div className="rounded-lg bg-status-refunded-bg px-4 py-3">
            <p className="text-xs font-medium text-status-refunded">Au dépôt livreur</p>
            <p className="mt-1 text-2xl font-bold text-status-refunded">{depotCount}</p>
          </div>
          <div className="rounded-lg bg-status-delivered-bg px-4 py-3">
            <p className="text-xs font-medium text-status-delivered">Retour reçu</p>
            <p className="mt-1 text-2xl font-bold text-status-delivered">{recuCount}</p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col gap-2 border-b border-border bg-surface px-5 py-3 md:flex-row md:items-center md:gap-3">
          <div className="relative w-64">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-light" />
            <Input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="Rechercher..."
              className="pl-8"
            />
          </div>
          <div className="flex gap-1 overflow-x-auto">
            {[
              { key: "all", label: "Tous", count: orders.length },
              { key: "RETOUR", label: "En retour", count: retourCount },
              { key: "RETOUR_DEPOT", label: "Au dépôt", count: depotCount },
              { key: "RETOUR_RECU", label: "Reçus", count: recuCount },
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => { setFilter(tab.key as any); setPage(1); }}
                className={cn(
                  "flex shrink-0 items-center gap-1 rounded px-2 py-1 text-[10px] font-medium transition-colors md:gap-1.5 md:rounded-md md:px-3 md:py-1.5 md:text-xs",
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
                  <th className="px-4 py-2.5">Téléphone</th>
                  <th className="px-4 py-2.5">Produits</th>
                  <th className="px-4 py-2.5">Total</th>
                  <th className="px-4 py-2.5">Livreur</th>
                  <th className="px-4 py-2.5">Statut</th>
                  <th className="px-4 py-2.5">Action</th>
                </tr>
              </thead>
              <tbody>
                {pageOrders.map((order) => (
                  <tr
                    key={order.id}
                    className={cn(
                      "border-b border-border transition-colors hover:bg-surface-sunken",
                      order.orderStatus === "RETOUR_RECU" && "opacity-60"
                    )}
                  >
                    <td className="px-4 py-3">
                      <span className="font-mono text-[13px] font-semibold">{order.orderNumber}</span>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted whitespace-nowrap">
                      {formatDate(order.sourceCreatedAt)}
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium truncate max-w-[150px]">{order.customerName ?? "—"}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs">{order.customerPhone ?? "—"}</span>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted">
                      {order.lineItems?.map((li) => (
                        <div key={li.id} className="truncate max-w-[200px]">
                          {li.title} × {li.quantity}
                        </div>
                      ))}
                    </td>
                    <td className="px-4 py-3 font-mono text-sm font-medium">
                      {formatMoney(order.total, order.currency)}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted">
                      {order.deliveryCompany ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn(
                        "rounded px-2 py-1 text-xs font-medium",
                        STATUS_STYLE[order.orderStatus] ?? "bg-surface-sunken text-muted"
                      )}>
                        {STATUS_LABEL[order.orderStatus] ?? order.orderStatus}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {order.orderStatus !== "RETOUR_RECU" && (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => markRetourRecu(order.id)}
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Retour reçu
                        </Button>
                      )}
                      {order.orderStatus === "RETOUR_RECU" && (
                        <span className="text-xs font-medium text-status-delivered flex items-center gap-1">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Reçu
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {!loading && pageOrders.length === 0 && (
            <div className="flex flex-col items-center justify-center py-24">
              <RotateCcw className="h-8 w-8 text-muted-light" />
              <p className="mt-2 text-sm font-medium">Aucun retour</p>
              <p className="mt-1 text-xs text-muted">Les commandes en retour apparaîtront ici.</p>
            </div>
          )}
        </div>

        <footer className="flex shrink-0 items-center justify-between border-t border-border bg-surface px-5 py-2.5">
          <p className="text-xs text-muted">{filtered.length} retours</p>
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

      {showScanner && (
        <ScanRetourModal
          onClose={() => setShowScanner(false)}
          onScanned={handleScanned}
        />
      )}
    </div>
  );
}

export default function RetoursPage() {
  return (
    <RouteGuard>
      <RetoursContent />
    </RouteGuard>
  );
}