"use client";

import { useState, useRef, useEffect } from "react";
import { RouteGuard } from "@/components/auth/route-guard";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { QrCode, CheckCircle2, XCircle, Camera, Package, Lock } from "lucide-react";
import { OrderStatus, ORDER_STATUS_LABELS } from "@/types/order";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api";

function getToken() {
  return window.localStorage.getItem("orderly_token");
}

// Only internal statuses — courier statuses come from sync
const SCAN_ACTIONS: { status: OrderStatus; label: string; desc: string; color: string }[] = [
  {
    status: "EMBALLE",
    label: "Emballé",
    desc: "Colis prêt, prêt à être ramassé",
    color: "bg-status-shipped-bg text-status-shipped border-status-shipped",
  },
  {
    status: "RETOUR_RECU",
    label: "Retour reçu",
    desc: "Colis retourné physiquement récupéré",
    color: "bg-status-refunded-bg text-status-refunded border-status-refunded",
  },
];

const COURIER_STATUSES = [
  "AU_DEPOT_LIVREUR",
  "EN_COURS_DE_LIVRAISON",
  "LIVRE",
  "PAYE",
  "RETOUR",
  "RETOUR_DEPOT",
];

function ScannerContent() {
  const [input, setInput] = useState("");
  const [order, setOrder] = useState<any>(null);
  const [scanSource, setScanSource] = useState("");
  const [selectedStatus, setSelectedStatus] = useState<OrderStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<"success" | "error" | null>(null);
  const [message, setMessage] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  async function handleScan() {
    if (!input.trim()) return;
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch(`${API}/orders/scan`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${getToken()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ code: input.trim() }),
      });
      const data = await res.json();

      if (!data.ok) {
        setResult("error");
        setMessage(data.error ?? "Commande introuvable");
        setInput("");
        return;
      }

      setOrder(data.order);
      setScanSource(data.source);
      setSelectedStatus(null);
      setInput("");
    } catch {
      setResult("error");
      setMessage("Erreur réseau");
    } finally {
      setLoading(false);
    }
  }

  async function applyStatus() {
    if (!order || !selectedStatus) return;
    setLoading(true);
    try {
      const res = await fetch(`${API}/orders/${order.id}/status`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${getToken()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status: selectedStatus }),
      });
      if (!res.ok) throw new Error();
      setResult("success");
      setMessage(
        `${order.orderNumber} → ${ORDER_STATUS_LABELS[selectedStatus]}`
      );
      reset();
    } catch {
      setResult("error");
      setMessage("Erreur lors de la mise à jour");
    } finally {
      setLoading(false);
    }
  }

  function reset() {
    setOrder(null);
    setScanSource("");
    setSelectedStatus(null);
    setInput("");
    setTimeout(() => inputRef.current?.focus(), 100);
  }

  const isCourierControlled = order && COURIER_STATUSES.includes(order.orderStatus);

  return (
    <div className="min-h-screen bg-background">
      <header className="flex h-14 items-center justify-between border-b border-border bg-surface px-5">
        <div className="flex items-center gap-2">
          <QrCode className="h-5 w-5 text-primary" />
          <h1 className="text-base font-semibold">Scanner</h1>
        </div>
        <a href="/preparation" className="text-xs text-muted hover:text-foreground">
          ← Retour préparation
        </a>
      </header>

      <div className="mx-auto max-w-lg p-6 space-y-5">
        {result && (
          <div
            className={cn(
              "flex items-center gap-3 rounded-lg p-4",
              result === "success" ? "bg-status-delivered-bg" : "bg-status-cancelled-bg"
            )}
          >
            {result === "success" ? (
              <CheckCircle2 className="h-5 w-5 shrink-0 text-status-delivered" />
            ) : (
              <XCircle className="h-5 w-5 shrink-0 text-status-cancelled" />
            )}
            <p
              className={cn(
                "text-sm font-medium",
                result === "success" ? "text-status-delivered" : "text-status-cancelled"
              )}
            >
              {message}
            </p>
            <button onClick={() => setResult(null)} className="ml-auto text-muted">
              ×
            </button>
          </div>
        )}

        {!order ? (
          <div className="rounded-xl border border-border bg-surface p-6 space-y-4">
            <div className="flex flex-col items-center gap-3 py-4">
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-primary-soft">
                <Camera className="h-10 w-10 text-primary" />
              </div>
              <p className="text-sm font-medium">Scannez le code-barres du colis</p>
              <p className="text-center text-xs text-muted">
                Étiquette Cosmos, bordereau Orderly ou numéro de commande
              </p>
            </div>

            <div>
              <input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleScan()}
                placeholder="Scanner ou saisir le code..."
                className="w-full rounded-md border border-border bg-surface-sunken px-3 py-2.5 text-sm font-mono focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              />
              <Button
                className="mt-2 w-full"
                disabled={!input.trim() || loading}
                onClick={handleScan}
              >
                {loading ? "Recherche..." : "Rechercher"}
              </Button>
              <p className="mt-2 text-[11px] text-muted">
                Avec un scanner USB : placez le curseur dans le champ et scannez.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-xl border border-status-delivered/30 bg-status-delivered-bg p-4">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-status-delivered" />
                  <p className="text-sm font-medium text-status-delivered">Commande trouvée</p>
                </div>
                <span className="rounded bg-white/60 px-1.5 py-0.5 text-[10px] font-medium text-status-delivered">
                  {scanSource === "cosmos-barcode"
                    ? "Étiquette Cosmos"
                    : scanSource === "orderly-qr"
                    ? "QR Orderly"
                    : "Numéro commande"}
                </span>
              </div>
              <div className="space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted">Commande</span>
                  <span className="font-mono font-semibold">{order.orderNumber}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted">Client</span>
                  <span className="font-medium">{order.customerName ?? "—"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted">Statut actuel</span>
                  <span className="font-medium">
                    {ORDER_STATUS_LABELS[order.orderStatus as OrderStatus] ?? order.orderStatus}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted">Total</span>
                  <span className="font-mono font-semibold">
                    {Number(order.total).toFixed(3)} {order.currency}
                  </span>
                </div>
              </div>
            </div>

            {isCourierControlled ? (
              <div className="flex items-start gap-2.5 rounded-xl border border-status-processing/30 bg-status-processing-bg p-4">
                <Lock className="mt-0.5 h-4 w-4 shrink-0 text-status-processing" />
                <div className="text-xs text-status-processing">
                  <p className="font-semibold">Statut géré par le transporteur</p>
                  <p className="mt-0.5">
                    Ce colis est chez le livreur. Son statut se met à jour automatiquement
                    via la synchronisation. Aucune action manuelle possible ici.
                  </p>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-border bg-surface p-4 space-y-3">
                <p className="text-sm font-medium">Action</p>
                <div className="space-y-2">
                  {SCAN_ACTIONS.map((a) => (
                    <button
                      key={a.status}
                      onClick={() => setSelectedStatus(a.status)}
                      disabled={a.status === order.orderStatus}
                      className={cn(
                        "flex w-full items-start gap-2.5 rounded-lg border-2 px-3 py-2.5 text-left transition-colors",
                        a.status === order.orderStatus
                          ? "cursor-default border-border opacity-40"
                          : selectedStatus === a.status
                          ? a.color
                          : "border-border hover:border-border-strong"
                      )}
                    >
                      <Package className="mt-0.5 h-4 w-4 shrink-0" />
                      <div>
                        <p className="text-xs font-semibold">{a.label}</p>
                        <p className="text-[11px] opacity-80">{a.desc}</p>
                        {a.status === order.orderStatus && (
                          <p className="mt-0.5 text-[10px]">statut actuel</p>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-2">
              <Button variant="secondary" className="flex-1" onClick={reset}>
                Scanner un autre
              </Button>
              {!isCourierControlled && (
                <Button
                  className="flex-1"
                  disabled={!selectedStatus || loading}
                  onClick={applyStatus}
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  {loading ? "..." : "Confirmer"}
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ScannerPage() {
  return (
    <RouteGuard>
      <ScannerContent />
    </RouteGuard>
  );
}