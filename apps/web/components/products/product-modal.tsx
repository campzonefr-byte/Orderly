"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  X, Package, TrendingDown, History, Plus, Minus,
  AlertTriangle, Settings, Calendar, RotateCcw,
} from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api";

function getToken() {
  return window.localStorage.getItem("orderly_token");
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("fr-FR", {
    day: "numeric", month: "short", year: "numeric",
  });
}

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString("fr-FR", {
    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
  });
}

const LOG_LABELS: Record<string, string> = {
  ADD: "Ajout de stock",
  REMOVE: "Retrait de stock",
  SET: "Stock redefini",
  TO_DEFECTIVE: "Marque defectueux",
  FROM_DEFECTIVE: "Remis en stock",
  CREATED: "Produit cree",
  SETTINGS_UPDATED: "Parametres modifies",
  SALE: "Vente",
  RESTOCK: "Reapprovisionnement",
  EXCHANGE_RETURN: "Retour echange",
};

export function ProductModal({
  productId,
  onClose,
  onUpdated,
}: {
  productId: string;
  onClose: () => void;
  onUpdated: () => void;
}) {
  const [tab, setTab] = useState<"stock" | "stats" | "history">("stock");
  const [product, setProduct] = useState<any>(null);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  // Stock form
  const [adjustType, setAdjustType] = useState<"ADD" | "REMOVE" | "TO_DEFECTIVE" | "FROM_DEFECTIVE">("ADD");
  const [qty, setQty] = useState("1");
  const [note, setNote] = useState("");

  // Settings form
  const [name, setName] = useState("");
  const [threshold, setThreshold] = useState("");
  const [reorder, setReorder] = useState("");
  const [cost, setCost] = useState("");
  const [sell, setSell] = useState("");

  async function load() {
    setLoading(true);
    try {
      const [pRes, listRes] = await Promise.all([
        fetch(`${API}/products/${productId}`, {
          headers: { Authorization: `Bearer ${getToken()}` },
        }),
        fetch(`${API}/products`, {
          headers: { Authorization: `Bearer ${getToken()}` },
        }),
      ]);
      const p = await pRes.json();
      const list = await listRes.json();
      const withStats = Array.isArray(list)
        ? list.find((x: any) => x.id === productId)
        : null;

      setProduct(p);
      setStats(withStats?.stats ?? null);
      setName(p.name ?? "");
      setThreshold(String(p.lowStockThreshold ?? 5));
      setReorder(String(p.reorderQty ?? 0));
      setCost(p.costPrice ? String(p.costPrice) : "");
      setSell(p.sellPrice ? String(p.sellPrice) : "");
    } catch {
      setProduct(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [productId]);

  async function adjust() {
    const q = parseInt(qty);
    if (!q || q <= 0) return;
    setBusy(true);
    try {
      const res = await fetch(`${API}/products/${productId}/adjust`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${getToken()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ type: adjustType, quantity: q, note }),
      });
      if (!res.ok) {
        const err = await res.json();
        alert(err.message ?? "Erreur");
        return;
      }
      setQty("1");
      setNote("");
      await load();
      onUpdated();
    } finally {
      setBusy(false);
    }
  }

  async function saveSettings() {
    setBusy(true);
    try {
      await fetch(`${API}/products/${productId}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${getToken()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name,
          lowStockThreshold: parseInt(threshold) || 0,
          reorderQty: parseInt(reorder) || 0,
          costPrice: cost ? parseFloat(cost) : null,
          sellPrice: sell ? parseFloat(sell) : null,
        }),
      });
      await load();
      onUpdated();
    } finally {
      setBusy(false);
    }
  }

  if (loading || !product) {
    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-foreground/30 backdrop-blur-[2px]">
        <div className="rounded-xl border border-border bg-surface px-8 py-6">
          <p className="text-sm text-muted">Chargement...</p>
        </div>
      </div>
    );
  }

  const isLow = product.quantityAvailable <= product.lowStockThreshold;
  const isOut = product.quantityAvailable === 0;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-foreground/30 backdrop-blur-[2px]">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-xl border border-border bg-surface shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-border px-5 py-4">
          <div className="flex items-center gap-3">
          {product.imageUrl ? (
              <img
                src={product.imageUrl}
                alt=""
                className="h-11 w-11 shrink-0 rounded-lg border border-border object-cover"
              />
            ) : (
              <div
                className={cn(
                  "flex h-11 w-11 items-center justify-center rounded-lg",
                  isOut
                    ? "bg-status-cancelled-bg"
                    : isLow
                    ? "bg-status-processing-bg"
                    : "bg-status-delivered-bg"
                )}
              >
                <Package
                  className={cn(
                    "h-5 w-5",
                    isOut
                      ? "text-status-cancelled"
                      : isLow
                      ? "text-status-processing"
                      : "text-status-delivered"
                  )}
                />
              </div>
            )}
            <div>
              <h2 className="text-sm font-semibold">{product.name}</h2>
              <p className="font-mono text-xs text-muted">
                {product.sku} · {product.storeName}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-md p-1 hover:bg-surface-sunken">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Stock summary */}
        <div className="grid grid-cols-4 gap-2 border-b border-border bg-surface-sunken px-5 py-3">
          <div>
            <p className="text-[10px] text-muted">Disponible</p>
            <p
              className={cn(
                "text-xl font-bold",
                isOut
                  ? "text-status-cancelled"
                  : isLow
                  ? "text-status-processing"
                  : "text-status-delivered"
              )}
            >
              {product.quantityAvailable}
            </p>
          </div>
          <div>
            <p className="text-[10px] text-muted">Defectueux</p>
            <p className="text-xl font-bold text-status-refunded">{product.defectiveQty}</p>
          </div>
          <div>
            <p className="text-[10px] text-muted">Seuil alerte</p>
            <p className="text-xl font-bold text-muted">{product.lowStockThreshold}</p>
          </div>
          <div>
            <p className="text-[10px] text-muted">Rupture dans</p>
            <p className="text-xl font-bold">
              {stats?.daysLeft !== null && stats?.daysLeft !== undefined
                ? `${stats.daysLeft}j`
                : "—"}
            </p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-border px-5 py-2">
          {[
            { key: "stock", label: "Stock", icon: Package },
            { key: "stats", label: "Statistiques", icon: TrendingDown },
            { key: "history", label: "Historique", icon: History },
          ].map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key as any)}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                  tab === t.key
                    ? "bg-primary-soft text-primary"
                    : "text-muted hover:bg-surface-sunken"
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {t.label}
              </button>
            );
          })}
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {tab === "stock" && (
            <div className="space-y-5">
              {/* Adjust */}
              <div className="rounded-lg border border-border p-4 space-y-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                  Ajuster le stock
                </p>

                <div className="grid grid-cols-2 gap-2">
                  {[
                    { key: "ADD", label: "Ajouter", icon: Plus, tone: "border-status-delivered bg-status-delivered-bg text-status-delivered" },
                    { key: "REMOVE", label: "Retirer", icon: Minus, tone: "border-status-cancelled bg-status-cancelled-bg text-status-cancelled" },
                    { key: "TO_DEFECTIVE", label: "Marquer defectueux", icon: AlertTriangle, tone: "border-status-refunded bg-status-refunded-bg text-status-refunded" },
                    { key: "FROM_DEFECTIVE", label: "Remettre en stock", icon: RotateCcw, tone: "border-status-shipped bg-status-shipped-bg text-status-shipped" },
                  ].map((a) => {
                    const Icon = a.icon;
                    return (
                      <button
                        key={a.key}
                        onClick={() => setAdjustType(a.key as any)}
                        className={cn(
                          "flex items-center gap-2 rounded-lg border-2 px-3 py-2 text-xs font-medium transition-colors",
                          adjustType === a.key
                            ? a.tone
                            : "border-border text-muted hover:border-border-strong"
                        )}
                      >
                        <Icon className="h-3.5 w-3.5 shrink-0" />
                        {a.label}
                      </button>
                    );
                  })}
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="mb-1 block text-[11px] text-muted">Quantite</label>
                    <Input
                      type="number"
                      value={qty}
                      onChange={(e) => setQty(e.target.value)}
                      min={1}
                      className="h-8 text-xs"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="mb-1 block text-[11px] text-muted">Note</label>
                    <Input
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder="Raison de l'ajustement..."
                      className="h-8 text-xs"
                    />
                  </div>
                </div>

                <Button size="sm" className="w-full" disabled={busy} onClick={adjust}>
                  {busy ? "..." : "Appliquer"}
                </Button>
              </div>

              {/* Settings */}
              <div className="rounded-lg border border-border p-4 space-y-3">
                <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
                  <Settings className="h-3.5 w-3.5" />
                  Parametres
                </p>

                <div>
                  <label className="mb-1 block text-[11px] text-muted">Nom du produit</label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} className="h-8 text-xs" />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="mb-1 block text-[11px] text-muted">Seuil d'alerte</label>
                    <Input
                      type="number"
                      value={threshold}
                      onChange={(e) => setThreshold(e.target.value)}
                      min={0}
                      className="h-8 text-xs"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] text-muted">
                      Qte a recommander
                    </label>
                    <Input
                      type="number"
                      value={reorder}
                      onChange={(e) => setReorder(e.target.value)}
                      min={0}
                      className="h-8 text-xs"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] text-muted">Prix d'achat</label>
                    <Input
                      type="number"
                      value={cost}
                      onChange={(e) => setCost(e.target.value)}
                      step="0.001"
                      className="h-8 text-xs"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] text-muted">Prix de vente</label>
                    <Input
                      type="number"
                      value={sell}
                      onChange={(e) => setSell(e.target.value)}
                      step="0.001"
                      className="h-8 text-xs"
                    />
                  </div>
                </div>

                <Button
                  size="sm"
                  variant="secondary"
                  className="w-full"
                  disabled={busy}
                  onClick={saveSettings}
                >
                  Enregistrer les parametres
                </Button>
              </div>
            </div>
          )}

          {tab === "stats" && stats && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-lg bg-surface-sunken px-3 py-2.5">
                  <p className="text-[10px] text-muted">Vendus 7j</p>
                  <p className="mt-0.5 text-xl font-bold">{stats.sold7}</p>
                </div>
                <div className="rounded-lg bg-surface-sunken px-3 py-2.5">
                  <p className="text-[10px] text-muted">Vendus 30j</p>
                  <p className="mt-0.5 text-xl font-bold">{stats.sold30}</p>
                </div>
                <div className="rounded-lg bg-surface-sunken px-3 py-2.5">
                  <p className="text-[10px] text-muted">Vendus 90j</p>
                  <p className="mt-0.5 text-xl font-bold">{stats.sold90}</p>
                </div>
              </div>

              <div className="rounded-lg border-2 border-primary bg-primary-soft p-4">
                <p className="flex items-center gap-1.5 text-xs font-semibold text-primary">
                  <Calendar className="h-3.5 w-3.5" />
                  Prevision
                </p>
                <div className="mt-2 space-y-1 text-xs text-primary">
                  <p>
                    Vitesse moyenne :{" "}
                    <span className="font-bold">{stats.velocity} unites / jour</span>
                  </p>
                  {stats.daysLeft !== null ? (
                    <>
                      <p>
                        Rupture estimee dans{" "}
                        <span className="font-bold">{stats.daysLeft} jours</span>
                        {stats.outOfStockDate && ` (${fmtDate(stats.outOfStockDate)})`}
                      </p>
                      {stats.suggestedReorder > 0 && (
                        <p>
                          Commande suggeree :{" "}
                          <span className="font-bold">{stats.suggestedReorder} unites</span>{" "}
                          pour couvrir 30 jours
                        </p>
                      )}
                    </>
                  ) : (
                    <p>Pas assez de ventes pour estimer une rupture.</p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-status-delivered-bg px-3 py-2.5">
                  <p className="text-[10px] text-status-delivered">CA genere (90j)</p>
                  <p className="mt-0.5 font-mono text-lg font-bold text-status-delivered">
                    {stats.revenue.toLocaleString("fr-FR")} TND
                  </p>
                </div>
                <div className="rounded-lg bg-status-refunded-bg px-3 py-2.5">
                  <p className="text-[10px] text-status-refunded">Taux de retour</p>
                  <p className="mt-0.5 text-lg font-bold text-status-refunded">
                    {stats.returnRate}%
                    <span className="ml-1 text-[11px] font-normal">
                      ({stats.returned} unites)
                    </span>
                  </p>
                </div>
              </div>
            </div>
          )}

          {tab === "history" && (
            <div className="space-y-2">
              {product.logs?.length === 0 ? (
                <p className="py-8 text-center text-xs text-muted">Aucun mouvement</p>
              ) : (
                product.logs.map((l: any) => (
                  <div
                    key={l.id}
                    className="flex items-start gap-3 rounded-lg border border-border px-3 py-2.5"
                  >
                    <div
                      className={cn(
                        "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold",
                        l.quantityChange > 0
                          ? "bg-status-delivered-bg text-status-delivered"
                          : l.quantityChange < 0
                          ? "bg-status-cancelled-bg text-status-cancelled"
                          : "bg-surface-sunken text-muted"
                      )}
                    >
                      {l.quantityChange > 0 ? "+" : l.quantityChange < 0 ? "−" : "="}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium">
                        {LOG_LABELS[l.type] ?? l.type}
                        {l.quantityChange !== 0 && (
                          <span className="ml-1 font-mono">
                            {l.quantityBefore} → {l.quantityAfter}
                          </span>
                        )}
                      </p>
                      {l.note && <p className="mt-0.5 text-[11px] text-muted">{l.note}</p>}
                      <p className="mt-0.5 text-[10px] text-muted-light">
                        {l.actorName} · {fmtDateTime(l.createdAt)}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        <div className="border-t border-border px-5 py-4">
          <Button variant="secondary" className="w-full" onClick={onClose}>
            Fermer
          </Button>
        </div>
      </div>
    </div>
  );
}