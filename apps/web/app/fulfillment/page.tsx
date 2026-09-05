"use client";
import {
  AdvancedFilters,
  ActiveFilterChips,
  applyAdvancedFilters,
  EMPTY_FILTERS,
  type AdvancedFilterState,
} from "@/components/stats/advanced-filters";

import {
  PeriodFilter,
  StatCard,
  getPeriodRange,
  isInPeriod,
  type Period,
} from "@/components/stats/period-filter";

import { useState, useEffect, useCallback } from "react";
import { Sidebar } from "@/components/layout/sidebar";
import { RouteGuard } from "@/components/auth/route-guard";
import { useStores } from "@/lib/stores-context";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Search, ChevronLeft, ChevronRight, ChevronDown, Upload, CheckCircle2, XCircle, X ,Lock,} from "lucide-react";
import { Order, OrderStatus, ORDER_STATUS_LABELS } from "@/types/order";
import * as XLSX from "xlsx";

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

const DELIVERY_STATUSES: { status: OrderStatus; label: string; color: string }[] = [
  { status: "CONFIRME", label: "Confirmé", color: "text-status-new" },
  { status: "EN_PREPARATION", label: "En préparation", color: "text-status-processing" },
  { status: "A_EXPEDIER", label: "À expédier", color: "text-status-shipped" },
  { status: "AU_DEPOT_LIVREUR", label: "Au dépôt livreur", color: "text-status-shipped" },
  { status: "EN_COURS_DE_LIVRAISON", label: "En cours de livraison", color: "text-status-shipped" },
  { status: "LIVRE", label: "Livré", color: "text-status-delivered" },
  { status: "PAYE", label: "Payé", color: "text-status-delivered" },
  { status: "RETOUR", label: "Retour", color: "text-status-refunded" },
  { status: "RETOUR_DEPOT", label: "Retour dépôt", color: "text-status-refunded" },
  { status: "RETOUR_RECU", label: "Retour reçu", color: "text-status-refunded" },
  { status: "ANNULE", label: "Annulé", color: "text-status-cancelled" },
  { status: "IMPRIME", label: "Imprimé", color: "text-status-shipped" },
{ status: "EMBALLE", label: "Emballé", color: "text-status-shipped" },
];

const STATUS_COLORS: Record<string, string> = {
  CONFIRME: "bg-status-new-bg text-status-new",
  EN_PREPARATION: "bg-status-processing-bg text-status-processing",
  A_EXPEDIER: "bg-status-shipped-bg text-status-shipped",
  AU_DEPOT_LIVREUR: "bg-status-shipped-bg text-status-shipped",
  EN_COURS_DE_LIVRAISON: "bg-status-shipped-bg text-status-shipped",
  LIVRE: "bg-status-delivered-bg text-status-delivered",
  PAYE: "bg-status-delivered-bg text-status-delivered",
  RETOUR: "bg-status-refunded-bg text-status-refunded",
  RETOUR_DEPOT: "bg-status-refunded-bg text-status-refunded",
  RETOUR_RECU: "bg-status-refunded-bg text-status-refunded",
  ANNULE: "bg-status-cancelled-bg text-status-cancelled",
  ECHANGE: "bg-purple-50 text-purple-600",
  IMPRIME: "bg-status-shipped-bg text-status-shipped",
  EMBALLE: "bg-status-shipped-bg text-status-shipped",
};

interface ImportResult {
  updated: number;
  notFound: number;
  alreadyUpToDate: number;
  details: { barcode: string; status: "updated" | "not_found" | "already_up_to_date"; orderNumber?: string }[];
}

function ImportModal({
  orders,
  onClose,
  onDone,
}: {
  orders: Order[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [dragOver, setDragOver] = useState(false);

  async function processFile(file: File) {
    setLoading(true);
    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet) as any[];

      const importResult: ImportResult = {
        updated: 0,
        notFound: 0,
        alreadyUpToDate: 0,
        details: [],
      };

      for (const row of rows) {
        const barcode = String(
          row["Order ID"] ?? row["Barcode"] ?? row["barcode"] ?? row["order_id"] ??
          row["Reference"] ?? row["reference"] ?? row["ID"] ?? ""
        ).trim();

        if (!barcode) continue;

        const deliveredAt = row["Delivered At"] ?? row["delivered_at"] ?? row["Date livraison"] ?? null;
        const isPaid = row["Paid At"] ?? row["paid_at"] ?? row["Date paiement"] ?? deliveredAt ?? null;

        const order = orders.find((o) =>
          o.externalOrderId === barcode ||
          o.externalOrderId === barcode.replace("#", "") ||
          o.orderNumber === barcode ||
          o.orderNumber === `#${barcode}`
        );

        if (!order) {
          importResult.notFound++;
          importResult.details.push({ barcode, status: "not_found" });
          continue;
        }

        const newStatus: OrderStatus = isPaid ? "PAYE" : deliveredAt ? "LIVRE" : order.orderStatus;

        if (newStatus === order.orderStatus) {
          importResult.alreadyUpToDate++;
          importResult.details.push({ barcode, status: "already_up_to_date", orderNumber: order.orderNumber });
          continue;
        }

        await fetch(`${API}/orders/${order.id}/status`, {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${getToken()}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ status: newStatus }),
        });

        importResult.updated++;
        importResult.details.push({ barcode, status: "updated", orderNumber: order.orderNumber });
      }

      setResult(importResult);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  function handleFile(file: File) {
    if (!file) return;
    processFile(file);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30 backdrop-blur-[2px]">
      <div className="w-full max-w-lg rounded-xl border border-border bg-surface shadow-2xl max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-sm font-semibold">Importer paiements Cosmos</h2>
          <button onClick={onClose} className="rounded-md p-1 hover:bg-surface-sunken">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {!result && !loading && (
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                const file = e.dataTransfer.files[0];
                if (file) handleFile(file);
              }}
              className={cn(
                "flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-10 transition-colors cursor-pointer",
                dragOver ? "border-primary bg-primary-soft" : "border-border hover:border-border-strong"
              )}
              onClick={() => document.getElementById("cosmos-file")?.click()}
            >
              <Upload className="h-10 w-10 text-muted-light mb-3" />
              <p className="text-sm font-medium">Glisser le fichier Excel Cosmos ici</p>
              <p className="text-xs text-muted mt-1">ou cliquer pour sélectionner</p>
              <p className="text-xs text-muted mt-2">.xlsx, .xls, .csv acceptés</p>
              <input
                id="cosmos-file"
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFile(file);
                }}
              />
            </div>
          )}

          {loading && (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent mb-3" />
              <p className="text-sm text-muted">Traitement en cours...</p>
            </div>
          )}

          {result && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-lg bg-status-delivered-bg p-3 text-center">
                  <p className="text-2xl font-bold text-status-delivered">{result.updated}</p>
                  <p className="text-xs text-status-delivered">Mis à jour</p>
                </div>
                <div className="rounded-lg bg-status-cancelled-bg p-3 text-center">
                  <p className="text-2xl font-bold text-status-cancelled">{result.notFound}</p>
                  <p className="text-xs text-status-cancelled">Non trouvés</p>
                </div>
                <div className="rounded-lg bg-surface-sunken p-3 text-center">
                  <p className="text-2xl font-bold text-muted">{result.alreadyUpToDate}</p>
                  <p className="text-xs text-muted">Déjà à jour</p>
                </div>
              </div>

              <div className="rounded-lg border border-border divide-y divide-border max-h-60 overflow-y-auto">
                {result.details.map((d, i) => (
                  <div key={i} className="flex items-center justify-between px-3 py-2">
                    <div className="flex items-center gap-2">
                      {d.status === "updated" && <CheckCircle2 className="h-4 w-4 text-status-delivered" />}
                      {d.status === "not_found" && <XCircle className="h-4 w-4 text-status-cancelled" />}
                      {d.status === "already_up_to_date" && <CheckCircle2 className="h-4 w-4 text-muted" />}
                      <span className="font-mono text-xs">{d.barcode}</span>
                    </div>
                    <span className="text-xs text-muted">
                      {d.status === "updated" && `✓ ${d.orderNumber} mis à jour`}
                      {d.status === "not_found" && "Non trouvé"}
                      {d.status === "already_up_to_date" && `${d.orderNumber} déjà à jour`}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex gap-2 border-t border-border px-5 py-4">
          {result ? (
            <>
              <Button variant="secondary" className="flex-1" onClick={onClose}>Fermer</Button>
              <Button className="flex-1" onClick={() => { onDone(); onClose(); }}>
                Actualiser
              </Button>
            </>
          ) : (
            <Button variant="secondary" className="flex-1" onClick={onClose}>Annuler</Button>
          )}
        </div>
      </div>
    </div>
  );
}

function StatusDropdown({
  order,
  onChangeStatus,
}: {
  order: Order;
  onChangeStatus: (orderId: string, status: OrderStatus) => void;
}) {
  const [open, setOpen] = useState(false);

  // Statuses controlled by the carrier — read-only
  const COURIER_CONTROLLED: OrderStatus[] = [
    "AU_DEPOT_LIVREUR",
    "EN_COURS_DE_LIVRAISON",
    "LIVRE",
    "PAYE",
    "RETOUR",
    "RETOUR_DEPOT",
    "A_VERIFIER",
  ];

  const isLocked =
    order.deliveryCompany === "Cosmos" &&
    COURIER_CONTROLLED.includes(order.orderStatus);

  if (isLocked) {
    return (
      <span
        className={cn(
          "flex items-center gap-1.5 rounded px-2.5 py-1.5 text-xs font-medium",
          STATUS_COLORS[order.orderStatus] ?? "bg-surface-sunken text-muted"
        )}
        title="Statut géré automatiquement par le transporteur"
      >
        {ORDER_STATUS_LABELS[order.orderStatus] ?? order.orderStatus}
        <Lock className="h-3 w-3 opacity-60" />
      </span>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        className={cn(
          "flex items-center gap-1.5 rounded px-2.5 py-1.5 text-xs font-medium transition-colors",
          STATUS_COLORS[order.orderStatus] ?? "bg-surface-sunken text-muted"
        )}
      >
        {ORDER_STATUS_LABELS[order.orderStatus] ?? order.orderStatus}
        <ChevronDown className="h-3 w-3" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={(e) => { e.stopPropagation(); setOpen(false); }} />
          <div
            onClick={(e) => e.stopPropagation()}
            className="absolute left-0 top-[calc(100%+4px)] z-30 w-52 rounded-md border border-border bg-surface py-1 shadow-lg"
          >
            {DELIVERY_STATUSES.map((s) => (
              <button
                key={s.status}
                disabled={s.status === order.orderStatus}
                onClick={() => {
                  onChangeStatus(order.id, s.status);
                  setOpen(false);
                }}
                className={cn(
                  "flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors",
                  s.status === order.orderStatus
                    ? "cursor-default opacity-40"
                    : "hover:bg-surface-sunken"
                )}
              >
                <span className={cn("h-2 w-2 rounded-full", s.color)} />
                {s.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

const PAGE_SIZE = 25;

const DELIVERY_STATUS_KEYS: OrderStatus[] = [
  "CONFIRME", "EN_PREPARATION", "A_EXPEDIER", "AU_DEPOT_LIVREUR",
  "EN_COURS_DE_LIVRAISON", "LIVRE", "PAYE", "RETOUR", "RETOUR_DEPOT",
  "RETOUR_RECU", "ANNULE","IMPRIME", "EMBALLE",
];

function FulfillmentContent() {
  const { canAccessStore, hasPermission } = useAuth();
  const { stores } = useStores();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedStoreIds, setSelectedStoreIds] = useState<string[]>([]);
  const [filter, setFilter] = useState<OrderStatus | "all">("all");
  const [page, setPage] = useState(1);
  const [showImport, setShowImport] = useState(false);
  const [period, setPeriod] = useState<Period>(getPeriodRange("all"));
  const [advFilters, setAdvFilters] = useState<AdvancedFilterState>(EMPTY_FILTERS);

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
      setOrders(all.filter((o) => DELIVERY_STATUS_KEYS.includes(o.orderStatus)));
    } catch {
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  async function handleChangeStatus(orderId: string, status: OrderStatus) {
    const order = orders.find((o) => o.id === orderId);

    setOrders((prev) =>
      prev.map((o) => o.id === orderId ? { ...o, orderStatus: status } : o)
    );

    await fetch(`${API}/orders/${orderId}/status`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${getToken()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ status }),
    });

    // Exchange delivered → restock recovered items
    const isExchange = order?.tags?.includes("Échange") || order?.orderNumber?.startsWith("#E-");
    if (isExchange && (status === "LIVRE" || status === "PAYE")) {
      try {
        const res = await fetch(`${API}/orders/${orderId}/restock-exchange`, {
          method: "POST",
          headers: { Authorization: `Bearer ${getToken()}` },
        });
        const data = await res.json();
        if (data.restocked > 0) {
          alert(`${data.restocked} produit(s) récupéré(s) remis en stock automatiquement.`);
        }
      } catch (e) {
        console.error(e);
      }
    }
  }

  const filtered = orders.filter((o) => {
    if (!selectedStoreIds.includes(o.storeId)) return false;
    if (!isInPeriod(o.sourceCreatedAt, period)) return false;
    if (!applyAdvancedFilters(o, advFilters)) return false;
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

  // Orders matching stats filters
  const statsOrders = orders.filter((o) => {
    if (!selectedStoreIds.includes(o.storeId)) return false;
    if (!isInPeriod(o.sourceCreatedAt, period)) return false;
    if (!applyAdvancedFilters(o, advFilters)) return false;
    return true;
  });

  const counts: Record<string, number> = {};
  statsOrders.forEach((o) => {
    counts[o.orderStatus] = (counts[o.orderStatus] ?? 0) + 1;
  });

  const statsTotal = statsOrders.length;
  const paidCount = counts["PAYE"] ?? 0;
  const livrePaidCount = (counts["LIVRE"] ?? 0) + paidCount;
  const enCoursCount =
    (counts["AU_DEPOT_LIVREUR"] ?? 0) +
    (counts["EN_COURS_DE_LIVRAISON"] ?? 0) +
    (counts["A_EXPEDIER"] ?? 0);
  const retourCount =
    (counts["RETOUR"] ?? 0) +
    (counts["RETOUR_DEPOT"] ?? 0) +
    (counts["RETOUR_RECU"] ?? 0);

  // Taux de livraison = livrés / (livrés + retours) — sur les commandes terminées
  const finished = livrePaidCount + retourCount;
  const tauxLivraison = finished > 0 ? Math.round((livrePaidCount / finished) * 100) : 0;
  const tauxRetour = finished > 0 ? Math.round((retourCount / finished) * 100) : 0;

  const caEncaisse = statsOrders
    .filter((o) => o.orderStatus === "PAYE")
    .reduce((s, o) => s + Number(o.total), 0);

  const caEnAttente = statsOrders
    .filter((o) => o.orderStatus === "LIVRE")
    .reduce((s, o) => s + Number(o.total), 0);

  

  return (
    <div className="flex h-screen bg-background">
      <Sidebar
        stores={accessibleStores}
        selectedStoreIds={selectedStoreIds}
        onChangeSelectedStores={setSelectedStoreIds}
      />

      <div className="flex min-w-0 flex-1 flex-col pt-14 md:pt-0">
        <header className="flex min-h-14 w-full max-w-full shrink-0 flex-wrap items-center justify-between gap-2 overflow-hidden border-b border-border bg-surface px-3 py-2 md:h-14 md:flex-nowrap md:px-5 md:py-0">
          <h1 className="text-base font-semibold">Livraison</h1>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="secondary" onClick={() => setShowImport(true)}>
              <Upload className="h-3.5 w-3.5" />
              Importer paiements
            </Button>
            <p className="text-xs text-muted">{orders.length} commandes</p>
          </div>
        </header>

       {/* Period filter */}
       <div className="border-b border-border bg-surface px-5 py-3">
          <PeriodFilter period={period} onChange={setPeriod} />
        </div>

        {/* Stats */}
        {hasPermission("stats") && (
        <div className="flex gap-3 overflow-x-auto border-b border-border bg-surface p-4 md:grid md:grid-cols-6 md:overflow-visible">
          <StatCard className="min-w-[100px] md:min-w-0" label="Total" value={statsTotal} color="gray" />
          <StatCard className="min-w-[100px] md:min-w-0" label="En cours" value={enCoursCount} total={statsTotal} color="blue" />
          <StatCard className="min-w-[100px] md:min-w-0" label="Livrés" value={livrePaidCount} total={statsTotal} color="green" />
          <StatCard className="min-w-[100px] md:min-w-0" label="Payés" value={paidCount} total={statsTotal} color="green" />
          <StatCard className="min-w-[100px] md:min-w-0" label="Retours" value={retourCount} total={statsTotal} color="red" />
          <div className="min-w-[100px] shrink-0 rounded-lg bg-primary-soft px-2.5 py-1.5 md:min-w-0 md:px-4 md:py-3">
            <p className="text-[10px] font-medium text-primary md:text-[11px]">Taux de livraison</p>
            <p className="mt-1 text-2xl font-bold text-primary">{tauxLivraison}%</p>
            <div className="mt-2 h-1.5 w-full rounded-full bg-white/50">
              <div
                className="h-1.5 rounded-full bg-primary transition-all"
                style={{ width: `${tauxLivraison}%` }}
              />
            </div>
            <p className="mt-1 text-[10px] text-primary/70">
              Retour : {tauxRetour}%
            </p>
          </div>
        </div>
        )}
        {/* Revenue row */}
        <div className="grid grid-cols-3 gap-3 border-b border-border bg-surface px-5 pb-4">
          <div className="rounded-lg bg-status-delivered-bg px-4 py-3">
            <p className="text-[11px] font-medium text-status-delivered">CA encaissé (payé)</p>
            <p className="mt-1 text-xl font-bold text-status-delivered font-mono">
              {caEncaisse.toLocaleString("fr-FR", { maximumFractionDigits: 0 })} TND
            </p>
          </div>
          <div className="rounded-lg bg-status-processing-bg px-4 py-3">
            <p className="text-[11px] font-medium text-status-processing">CA en attente (livré non payé)</p>
            <p className="mt-1 text-xl font-bold text-status-processing font-mono">
              {caEnAttente.toLocaleString("fr-FR", { maximumFractionDigits: 0 })} TND
            </p>
          </div>
          <div className="rounded-lg bg-surface-sunken px-4 py-3">
            <p className="text-[11px] font-medium text-muted">Commandes terminées</p>
            <p className="mt-1 text-xl font-bold font-mono">
              {finished} <span className="text-xs font-normal text-muted">/ {statsTotal}</span>
            </p>
          </div>
        </div>

        {/* Status filter tabs */}
        <div className="flex gap-1 overflow-x-auto border-b border-border bg-surface px-5 py-2">
          <button
            onClick={() => { setFilter("all"); setPage(1); }}
            className={cn(
              "shrink-0 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
              filter === "all" ? "bg-primary-soft text-primary" : "text-muted hover:bg-surface-sunken"
            )}
          >
            Tous ({orders.length})
          </button>
          {DELIVERY_STATUSES.map((s) => (
            <button
              key={s.status}
              onClick={() => { setFilter(s.status); setPage(1); }}
              className={cn(
                "shrink-0 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                filter === s.status ? "bg-primary-soft text-primary" : "text-muted hover:bg-surface-sunken"
              )}
            >
              {s.label} ({counts[s.status] ?? 0})
            </button>
          ))}
        </div>

       {/* Search + filters */}
       <div className="border-b border-border bg-surface px-5 py-3 space-y-2">
          <div className="flex items-center gap-3">
            <div className="relative w-64">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-light" />
              <Input
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                placeholder="Rechercher..."
                className="pl-8"
              />
            </div>
            <AdvancedFilters filters={advFilters} onChange={setAdvFilters} orders={orders} />
          </div>
          <ActiveFilterChips filters={advFilters} onChange={setAdvFilters} />
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
                  <th className="px-4 py-2.5">Agent</th>
                  <th className="px-4 py-2.5">Paiement</th>
                  <th className="px-4 py-2.5">Statut</th>
                </tr>
              </thead>
              <tbody>
                {pageOrders.map((order) => (
                  <tr key={order.id} className="border-b border-border transition-colors hover:bg-surface-sunken">
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
                    <td className="px-4 py-3">
                      {order.assignedAgentName ? (
                        <div className="flex items-center gap-1.5">
                          <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-white">
                            {order.assignedAgentName[0]?.toUpperCase()}
                          </div>
                          <span className="text-xs truncate max-w-[80px]">{order.assignedAgentName}</span>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-light">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {order.orderStatus === "PAYE" ? (
                        <span className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium bg-status-delivered-bg text-status-delivered">
                          <CheckCircle2 className="h-3 w-3" />
                          Payé
                        </span>
                      ) : order.orderStatus === "LIVRE" ? (
                        <span className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium bg-status-processing-bg text-status-processing">
                          En attente
                        </span>
                      ) : (
                        <span className="text-xs text-muted-light">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <StatusDropdown order={order} onChangeStatus={handleChangeStatus} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {!loading && pageOrders.length === 0 && (
            <div className="flex flex-col items-center justify-center py-24">
              <p className="text-sm font-medium">Aucune commande</p>
              <p className="mt-1 text-xs text-muted">Les commandes confirmées apparaîtront ici.</p>
            </div>
          )}
        </div>

        <footer className="flex shrink-0 items-center justify-between border-t border-border bg-surface px-5 py-2.5">
          <p className="text-xs text-muted">{filtered.length} commandes</p>
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

      {showImport && (
        <ImportModal
          orders={orders}
          onClose={() => setShowImport(false)}
          onDone={fetchOrders}
        />
      )}
    </div>
  );
}

export default function FulfillmentPage() {
  return (
    <RouteGuard>
      <FulfillmentContent />
    </RouteGuard>
  );
}