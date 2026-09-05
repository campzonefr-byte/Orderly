"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Calendar, ChevronDown } from "lucide-react";

export type PeriodKey = "today" | "7d" | "30d" | "all" | "custom";

export interface Period {
  key: PeriodKey;
  from: Date | null;
  to: Date | null;
}

export const PERIOD_LABELS: Record<PeriodKey, string> = {
  today: "Aujourd'hui",
  "7d": "7 derniers jours",
  "30d": "30 derniers jours",
  all: "Tout",
  custom: "Personnalisé",
};

export function getPeriodRange(key: PeriodKey, customFrom?: string, customTo?: string): Period {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  switch (key) {
    case "today":
      return { key, from: startOfToday, to: null };
    case "7d": {
      const from = new Date(startOfToday);
      from.setDate(from.getDate() - 7);
      return { key, from, to: null };
    }
    case "30d": {
      const from = new Date(startOfToday);
      from.setDate(from.getDate() - 30);
      return { key, from, to: null };
    }
    case "custom":
      return {
        key,
        from: customFrom ? new Date(customFrom) : null,
        to: customTo ? new Date(`${customTo}T23:59:59`) : null,
      };
    default:
      return { key: "all", from: null, to: null };
  }
}

export function isInPeriod(dateIso: string, period: Period): boolean {
  if (!period.from && !period.to) return true;
  const d = new Date(dateIso);
  if (period.from && d < period.from) return false;
  if (period.to && d > period.to) return false;
  return true;
}

export function PeriodFilter({
  period,
  onChange,
}: {
  period: Period;
  onChange: (p: Period) => void;
}) {
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [showCustom, setShowCustom] = useState(false);

  const KEYS: PeriodKey[] = ["today", "7d", "30d", "all"];

  return (
    <div className="flex items-center gap-2 overflow-x-auto md:flex-wrap md:overflow-visible">
      <div className="flex items-center gap-1">
        {KEYS.map((k) => (
          <button
            key={k}
            onClick={() => {
              setShowCustom(false);
              onChange(getPeriodRange(k));
            }}
            className={cn(
              "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
              period.key === k
                ? "bg-primary-soft text-primary"
                : "text-muted hover:bg-surface-sunken hover:text-foreground"
            )}
          >
            {PERIOD_LABELS[k]}
          </button>
        ))}
        <button
          onClick={() => setShowCustom((v) => !v)}
          className={cn(
            "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
            period.key === "custom"
              ? "bg-primary-soft text-primary"
              : "text-muted hover:bg-surface-sunken hover:text-foreground"
          )}
        >
          <Calendar className="h-3.5 w-3.5" />
          Personnalisé
          <ChevronDown className={cn("h-3 w-3 transition-transform", showCustom && "rotate-180")} />
        </button>
      </div>

      {showCustom && (
        <div className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2">
          <div>
            <label className="block text-[10px] text-muted">Du</label>
            <Input
              type="date"
              value={customFrom}
              onChange={(e) => {
                setCustomFrom(e.target.value);
                onChange(getPeriodRange("custom", e.target.value, customTo));
              }}
              className="h-7 text-xs"
            />
          </div>
          <div>
            <label className="block text-[10px] text-muted">Au</label>
            <Input
              type="date"
              value={customTo}
              onChange={(e) => {
                setCustomTo(e.target.value);
                onChange(getPeriodRange("custom", customFrom, e.target.value));
              }}
              className="h-7 text-xs"
            />
          </div>
        </div>
      )}
    </div>
  );
}

export function StatCard({
  label,
  value,
  total,
  color,
  suffix,
  className,
}: {
  label: string;
  value: number;
  total?: number;
  color: "green" | "red" | "orange" | "blue" | "purple" | "gray";
  suffix?: string;
  className?: string;
}) {
  const pct = total && total > 0 ? Math.round((value / total) * 100) : null;

  const COLORS = {
    green: { bg: "bg-status-delivered-bg", text: "text-status-delivered", bar: "bg-status-delivered" },
    red: { bg: "bg-status-cancelled-bg", text: "text-status-cancelled", bar: "bg-status-cancelled" },
    orange: { bg: "bg-status-processing-bg", text: "text-status-processing", bar: "bg-status-processing" },
    blue: { bg: "bg-status-shipped-bg", text: "text-status-shipped", bar: "bg-status-shipped" },
    purple: { bg: "bg-purple-50", text: "text-purple-600", bar: "bg-purple-500" },
    gray: { bg: "bg-surface-sunken", text: "text-muted", bar: "bg-muted" },
  };

  const c = COLORS[color];

  return (
    <div className={cn("rounded-lg px-4 py-3", c.bg, className)}>
      <p className={cn("text-[11px] font-medium", c.text)}>{label}</p>
      <div className="mt-1 flex items-baseline gap-2">
        <p className={cn("text-2xl font-bold", c.text)}>
          {value}{suffix}
        </p>
        {pct !== null && (
          <p className={cn("text-sm font-semibold", c.text)}>{pct}%</p>
        )}
      </div>
      {pct !== null && (
        <div className="mt-2 h-1.5 w-full rounded-full bg-white/50">
          <div
            className={cn("h-1.5 rounded-full transition-all", c.bar)}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
    </div>
  );
}