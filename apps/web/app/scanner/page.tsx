"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { RouteGuard } from "@/components/auth/route-guard";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  QrCode, CheckCircle2, XCircle, Package,
  RotateCcw, Trash2, Lock,
} from "lucide-react";
import { OrderStatus, ORDER_STATUS_LABELS } from "@/types/order";
import { CameraScanner } from "@/components/scanner/camera-scanner";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api";

function getToken() {
  return window.localStorage.getItem("orderly_token");
}

const MODES: { status: OrderStatus; label: string; desc: string; tone: string }[] = [
  {
    status: "EMBALLE",
    label: "Emballé",
    desc: "Colis prêt pour le ramassage",
    tone: "border-status-shipped bg-status-shipped-bg text-status-shipped",
  },
  {
    status: "RETOUR_RECU",
    label: "Retour reçu",
    desc: "Colis retourné récupéré au dépôt",
    tone: "border-status-refunded bg-status-refunded-bg text-status-refunded",
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

interface ScanEntry {
  id: string;
  code: string;
  orderNumber?: string;
  customer?: string;
  status: "ok" | "error" | "locked" | "already";
  message: string;
  at: string;
}

function beep(ok: boolean) {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = ok ? 880 : 220;
    gain.gain.value = 0.08;
    osc.start();
    setTimeout(() => {
      osc.stop();
      ctx.close();
    }, ok ? 90 : 220);
  } catch {}
}

function extractCode(raw: string): string {
  const v = raw.trim();
  // URL containing barcode=XXXX
  const m = v.match(/barcode=([^&\s]+)/i);
  if (m) return m[1];
  return v;
}

function ScannerContent() {
  const [mode, setMode] = useState<OrderStatus>("EMBALLE");
  const [input, setInput] = useState("");
  const [entries, setEntries] = useState<ScanEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const [cameraOn, setCameraOn] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const processingRef = useRef(false);

  useEffect(() => {
    if (!cameraOn) inputRef.current?.focus();
  }, [cameraOn, entries.length]);

  const handleCode = useCallback(
    async (raw: string) => {
      const code = extractCode(raw);
      if (!code || processingRef.current) return;

      processingRef.current = true;
      setBusy(true);

      const entryId = Date.now().toString();
      const now = new Date().toLocaleTimeString("fr-FR", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });

      try {
        const res = await fetch(`${API}/orders/scan`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${getToken()}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ code }),
        });
        const data = await res.json();

        if (!data.ok) {
          beep(false);
          setEntries((p) => [
            { id: entryId, code, status: "error", message: "Commande introuvable", at: now },
            ...p,
          ]);
          return;
        }

        const order = data.order;

        if (order.orderStatus === mode) {
          beep(false);
          setEntries((p) => [
            {
              id: entryId,
              code,
              orderNumber: order.orderNumber,
              customer: order.customerName,
              status: "already",
              message: "Deja dans ce statut",
              at: now,
            },
            ...p,
          ]);
          return;
        }

        if (COURIER_STATUSES.includes(order.orderStatus)) {
          beep(false);
          setEntries((p) => [
            {
              id: entryId,
              code,
              orderNumber: order.orderNumber,
              customer: order.customerName,
              status: "locked",
              message: `Chez le transporteur (${ORDER_STATUS_LABELS[order.orderStatus as OrderStatus]})`,
              at: now,
            },
            ...p,
          ]);
          return;
        }

        const upd = await fetch(`${API}/orders/${order.id}/status`, {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${getToken()}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ status: mode }),
        });

        if (!upd.ok) throw new Error();

        beep(true);
        setEntries((p) => [
          {
            id: entryId,
            code,
            orderNumber: order.orderNumber,
            customer: order.customerName,
            status: "ok",
            message: ORDER_STATUS_LABELS[mode],
            at: now,
          },
          ...p,
        ]);
      } catch {
        beep(false);
        setEntries((p) => [
          { id: entryId, code, status: "error", message: "Erreur reseau", at: now },
          ...p,
        ]);
      } finally {
        setInput("");
        setBusy(false);
        setTimeout(() => {
          processingRef.current = false;
        }, 400);
      }
    },
    [mode]
  );

  const okCount = entries.filter((e) => e.status === "ok").length;
  const errCount = entries.filter((e) => e.status !== "ok").length;
  const activeMode = MODES.find((m) => m.status === mode);

  return (
    <div className="min-h-screen bg-background">
      <header className="flex h-14 items-center justify-between border-b border-border bg-surface px-4">
        <div className="flex items-center gap-2">
          <QrCode className="h-5 w-5 text-primary" />
          <h1 className="text-base font-semibold">Scanner</h1>
        </div>
        <a href="/preparation" className="text-xs text-muted hover:text-foreground">
          Préparation
        </a>
      </header>

      <div className="mx-auto max-w-lg p-4 space-y-4">
        {/* Mode */}
        <div>
          <p className="mb-2 text-xs font-medium text-muted">Action appliquée à chaque scan</p>
          <div className="grid grid-cols-2 gap-2">
            {MODES.map((m) => (
              <button
                key={m.status}
                onClick={() => setMode(m.status)}
                className={cn(
                  "rounded-xl border-2 px-3 py-3 text-left transition-colors",
                  mode === m.status
                    ? m.tone
                    : "border-border text-muted hover:border-border-strong"
                )}
              >
                <p className="text-sm font-semibold">{m.label}</p>
                <p className="mt-0.5 text-[11px] opacity-80">{m.desc}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Input */}
        <div className="rounded-xl border border-border bg-surface p-4 space-y-3">
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCode(input);
            }}
            placeholder="Scanner ou saisir le code..."
            disabled={busy}
            className="w-full rounded-md border border-border bg-surface-sunken px-3 py-3 text-center font-mono text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50"
          />

          <CameraScanner onScan={handleCode} active={cameraOn} onToggle={setCameraOn} />

          <p className="text-center text-[11px] text-muted">
            Scanner USB : gardez le curseur dans le champ · Téléphone : activez la caméra
          </p>
        </div>

        {/* Counters */}
        {entries.length > 0 && (
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-lg bg-surface-sunken px-3 py-2 text-center">
              <p className="text-lg font-bold">{entries.length}</p>
              <p className="text-[10px] text-muted">scannés</p>
            </div>
            <div className="rounded-lg bg-status-delivered-bg px-3 py-2 text-center">
              <p className="text-lg font-bold text-status-delivered">{okCount}</p>
              <p className="text-[10px] text-status-delivered">
                {activeMode?.label.toLowerCase()}
              </p>
            </div>
            <div className="rounded-lg bg-status-cancelled-bg px-3 py-2 text-center">
              <p className="text-lg font-bold text-status-cancelled">{errCount}</p>
              <p className="text-[10px] text-status-cancelled">ignorés</p>
            </div>
          </div>
        )}

        {/* History */}
        {entries.length > 0 && (
          <div className="rounded-xl border border-border bg-surface">
            <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
              <p className="text-xs font-medium text-muted">Session en cours</p>
              <button
                onClick={() => setEntries([])}
                className="flex items-center gap-1 text-[11px] text-muted hover:text-status-cancelled"
              >
                <Trash2 className="h-3 w-3" />
                Vider
              </button>
            </div>
            <div className="max-h-80 divide-y divide-border overflow-y-auto">
              {entries.map((e) => (
                <div key={e.id} className="flex items-center gap-3 px-4 py-2.5">
                  {e.status === "ok" ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-status-delivered" />
                  ) : e.status === "locked" ? (
                    <Lock className="h-4 w-4 shrink-0 text-status-processing" />
                  ) : e.status === "already" ? (
                    <RotateCcw className="h-4 w-4 shrink-0 text-muted" />
                  ) : (
                    <XCircle className="h-4 w-4 shrink-0 text-status-cancelled" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium">
                      {e.orderNumber ?? e.code}
                      {e.customer && (
                        <span className="ml-1 font-normal text-muted">· {e.customer}</span>
                      )}
                    </p>
                    <p
                      className={cn(
                        "text-[11px]",
                        e.status === "ok"
                          ? "text-status-delivered"
                          : e.status === "locked"
                          ? "text-status-processing"
                          : e.status === "already"
                          ? "text-muted"
                          : "text-status-cancelled"
                      )}
                    >
                      {e.message}
                    </p>
                  </div>
                  <span className="shrink-0 font-mono text-[10px] text-muted-light">{e.at}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {entries.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12">
            <Package className="h-8 w-8 text-muted-light" />
            <p className="mt-2 text-sm text-muted">Aucun scan pour le moment</p>
            <p className="mt-1 text-center text-xs text-muted-light">
              Chaque code scanné passera en «&nbsp;{activeMode?.label}&nbsp;»
            </p>
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