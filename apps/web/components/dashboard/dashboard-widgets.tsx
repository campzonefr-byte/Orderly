"use client";

import { cn } from "@/lib/utils";
import { ORDER_STATUS_LABELS, OrderStatus } from "@/types/order";

export function money(n: number) {
  return n.toLocaleString("fr-FR", { maximumFractionDigits: 0 });
}

export function KpiCard({
  label,
  value,
  sub,
  tone = "gray",
  suffix,
}: {
  label: string;
  value: string | number;
  sub?: string;
  tone?: "gray" | "green" | "red" | "orange" | "blue" | "purple";
  suffix?: string;
}) {
  const TONES = {
    gray: "bg-surface-sunken text-foreground",
    green: "bg-status-delivered-bg text-status-delivered",
    red: "bg-status-cancelled-bg text-status-cancelled",
    orange: "bg-status-processing-bg text-status-processing",
    blue: "bg-status-shipped-bg text-status-shipped",
    purple: "bg-primary-soft text-primary",
  };

  return (
    <div className={cn("rounded-xl px-4 py-3.5", TONES[tone])}>
      <p className="text-[11px] font-medium opacity-80">{label}</p>
      <p className="mt-1 text-2xl font-bold">
        {value}
        {suffix}
      </p>
      {sub ? <p className="mt-0.5 text-[10px] opacity-70">{sub}</p> : null}
    </div>
  );
}

export function TimelineChart({
  data,
}: {
  data: { date: string; orders: number; delivered: number; revenue: number }[];
}) {
  if (data.length === 0) {
    return <p className="py-10 text-center text-xs text-muted">Aucune donnee</p>;
  }

  const max = Math.max(...data.map((d) => d.orders), 1);

  return (
    <div className="flex h-40 items-end gap-1">
      {data.map((d) => {
        const h = (d.orders / max) * 100;
        const dh = d.orders > 0 ? (d.delivered / d.orders) * h : 0;
        const label = new Date(d.date).toLocaleDateString("fr-FR", {
          day: "numeric",
          month: "short",
        });
        return (
          <div
            key={d.date}
            className="group relative flex flex-1 flex-col justify-end"
            title={label + " — " + d.orders + " commandes, " + d.delivered + " livrees"}
          >
            <div
              className="w-full rounded-t bg-primary-soft transition-all group-hover:bg-primary/30"
              style={{ height: h + "%" }}
            >
              <div
                className="w-full rounded-t bg-status-delivered"
                style={{ height: h > 0 ? (dh / h) * 100 + "%" : "0%", marginTop: "auto" }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function StatusBars({
  counts,
  total,
}: {
  counts: Record<string, number>;
  total: number;
}) {
  const COLOR: Record<string, string> = {
    NOUVEAU: "bg-status-new",
    CONFIRMATION_EN_COURS: "bg-status-processing",
    CONFIRME: "bg-status-new",
    ECHANGE: "bg-purple-500",
    A_PREPARER: "bg-status-new",
    EN_PREPARATION: "bg-status-processing",
    EMBALLE: "bg-status-shipped",
    A_EXPEDIER: "bg-status-shipped",
    AU_DEPOT_LIVREUR: "bg-status-shipped",
    EN_COURS_DE_LIVRAISON: "bg-status-shipped",
    LIVRE: "bg-status-delivered",
    PAYE: "bg-status-delivered",
    RETOUR: "bg-status-refunded",
    RETOUR_DEPOT: "bg-status-refunded",
    RETOUR_RECU: "bg-status-refunded",
    ANNULE: "bg-status-cancelled",
    A_VERIFIER: "bg-status-cancelled",
  };

  const entries = Object.entries(counts)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1]);

  if (entries.length === 0) {
    return <p className="py-6 text-center text-xs text-muted">Aucune commande</p>;
  }

  return (
    <div className="space-y-2">
      {entries.map(([status, count]) => {
        const pct = total > 0 ? (count / total) * 100 : 0;
        return (
          <div key={status} className="flex items-center gap-3">
            <span className="w-40 shrink-0 truncate text-xs text-muted">
              {ORDER_STATUS_LABELS[status as OrderStatus] ?? status}
            </span>
            <div className="h-2 flex-1 rounded-full bg-surface-sunken">
              <div
                className={cn("h-2 rounded-full transition-all", COLOR[status] ?? "bg-muted")}
                style={{ width: pct + "%" }}
              />
            </div>
            <span className="w-10 shrink-0 text-right font-mono text-xs font-semibold">
              {count}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function CarrierTable({
  carriers,
}: {
  carriers: {
    name: string;
    total: number;
    delivered: number;
    returned: number;
    revenue: number;
    deliveryRate: number;
    returnRate: number;
  }[];
}) {
  if (carriers.length === 0) {
    return <p className="py-6 text-center text-xs text-muted">Aucune donnee</p>;
  }

  return (
    <div className="space-y-2.5">
      {carriers.map((c) => (
        <div key={c.name} className="flex items-center gap-3">
          <span className="w-28 shrink-0 truncate text-xs font-medium">{c.name}</span>
          <div className="h-2 flex-1 rounded-full bg-surface-sunken">
            <div
              className={cn(
                "h-2 rounded-full",
                c.deliveryRate >= 70
                  ? "bg-status-delivered"
                  : c.deliveryRate >= 40
                  ? "bg-status-processing"
                  : "bg-status-cancelled"
              )}
              style={{ width: c.deliveryRate + "%" }}
            />
          </div>
          <span className="w-10 shrink-0 text-right font-mono text-xs font-bold">
            {c.deliveryRate}%
          </span>
          <span className="w-14 shrink-0 text-right text-[11px] text-muted">
            {c.total} cmd
          </span>
          <span className="w-20 shrink-0 text-right font-mono text-[11px] font-semibold">
            {money(c.revenue)}
          </span>
        </div>
      ))}
    </div>
  );
}

export function TopProducts({
  products,
}: {
  products: { title: string; qty: number; revenue: number; orders: number }[];
}) {
  if (products.length === 0) {
    return <p className="py-6 text-center text-xs text-muted">Aucun produit</p>;
  }

  const max = Math.max(...products.map((p) => p.qty), 1);

  return (
    <div className="space-y-2">
      {products.map((p, i) => (
        <div key={p.title} className="flex items-center gap-3">
          <span className="w-4 shrink-0 text-[10px] font-bold text-muted-light">
            {i + 1}
          </span>
          <span className="w-44 shrink-0 truncate text-xs font-medium">{p.title}</span>
          <div className="h-2 flex-1 rounded-full bg-surface-sunken">
            <div
              className="h-2 rounded-full bg-primary"
              style={{ width: (p.qty / max) * 100 + "%" }}
            />
          </div>
          <span className="w-12 shrink-0 text-right font-mono text-xs font-semibold">
            {p.qty}
          </span>
          <span className="w-20 shrink-0 text-right font-mono text-[11px] text-muted">
            {money(p.revenue)}
          </span>
        </div>
      ))}
    </div>
  );
}