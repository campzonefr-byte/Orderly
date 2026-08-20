"use client";

import { useState, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";
import { MapPin, ChevronDown, Check, AlertTriangle } from "lucide-react";

export const COSMOS_CITIES = [
  "Ariana", "Ben Arous", "Bizerte", "Beja", "Gabes", "Gafsa",
  "Jendouba", "Kairouan", "Kasserine", "Kebili", "Kef", "Mahdia",
  "Manouba", "Medenine", "Monastir", "Nabeul", "Sfax", "Sidi Bouzid",
  "Siliana", "Sousse", "Tataouine", "Tozeur", "Tunis", "Zaghouan",
];

// Common localities mapped to their governorate
const LOCALITY_MAP: Record<string, string> = {
  "la marsa": "Tunis",
  marsa: "Tunis",
  carthage: "Tunis",
  bardo: "Tunis",
  menzah: "Tunis",
  "el menzah": "Tunis",
  mutuelleville: "Tunis",
  lafayette: "Tunis",
  lac: "Tunis",
  "les berges du lac": "Tunis",
  goulette: "Tunis",
  "la goulette": "Tunis",
  kram: "Tunis",
  "le kram": "Tunis",
  sidi: "Tunis",
  "sidi bou said": "Tunis",
  raoued: "Ariana",
  soukra: "Ariana",
  "la soukra": "Ariana",
  ghazela: "Ariana",
  "cite ghazela": "Ariana",
  ennasr: "Ariana",
  "el aouina": "Tunis",
  aouina: "Tunis",
  megrine: "Ben Arous",
  rades: "Ben Arous",
  ezzahra: "Ben Arous",
  hammam: "Ben Arous",
  "hammam lif": "Ben Arous",
  "hammam chatt": "Ben Arous",
  mourouj: "Ben Arous",
  "el mourouj": "Ben Arous",
  fouchana: "Ben Arous",
  mornaguia: "Manouba",
  douar: "Manouba",
  "douar hicher": "Manouba",
  hammamet: "Nabeul",
  korba: "Nabeul",
  kelibia: "Nabeul",
  "beni khiar": "Nabeul",
  dar: "Nabeul",
  "dar chaabane": "Nabeul",
  menzel: "Nabeul",
  "menzel temime": "Nabeul",
  sahline: "Monastir",
  "ksar hellal": "Monastir",
  moknine: "Monastir",
  jemmal: "Monastir",
  "sayada": "Monastir",
  msaken: "Sousse",
  kalaa: "Sousse",
  "kalaa kebira": "Sousse",
  hergla: "Sousse",
  akouda: "Sousse",
  "port el kantaoui": "Sousse",
  djerba: "Medenine",
  jerba: "Medenine",
  houmt: "Medenine",
  "houmt souk": "Medenine",
  midoun: "Medenine",
  zarzis: "Medenine",
  "ben guerdane": "Medenine",
  sakiet: "Sfax",
  "sakiet ezzit": "Sfax",
  chihia: "Sfax",
  thyna: "Sfax",
  mahres: "Sfax",
  metlaoui: "Gafsa",
  redeyef: "Gafsa",
  moularès: "Gafsa",
  menzelbourguiba: "Bizerte",
  "menzel bourguiba": "Bizerte",
  mateur: "Bizerte",
  ras: "Bizerte",
  "ras jebel": "Bizerte",
  tabarka: "Jendouba",
  ain: "Jendouba",
  "ain draham": "Jendouba",
  nefta: "Tozeur",
  douz: "Kebili",
};

function normalize(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function detectCity(rawCity?: string | null, rawAddress?: string | null): string | null {
  const haystacks = [rawCity, rawAddress].filter(Boolean) as string[];

  for (const h of haystacks) {
    const clean = normalize(h);

    // Exact governorate match
    const exact = COSMOS_CITIES.find((c) => normalize(c) === clean);
    if (exact) return exact;

    // Governorate contained in the text
    const contained = COSMOS_CITIES.find((c) => {
      const nc = normalize(c);
      return clean.includes(nc) || nc.includes(clean);
    });
    if (contained) return contained;

    // Known locality
    for (const [locality, gov] of Object.entries(LOCALITY_MAP)) {
      if (clean.includes(locality)) return gov;
    }
  }

  return null;
}

export function isValidCity(city?: string | null): boolean {
  if (!city) return false;
  return COSMOS_CITIES.includes(city);
}

export function CityPicker({
  value,
  onChange,
  address,
  required,
  disabled,
}: {
  value: string;
  onChange: (city: string) => void;
  address?: string;
  required?: boolean;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const valid = isValidCity(value);
  const suggestion = !valid ? detectCity(value, address) : null;

  const filtered = COSMOS_CITIES.filter((c) =>
    normalize(c).includes(normalize(query || (open ? "" : value)))
  );

  function pick(city: string) {
    onChange(city);
    setQuery("");
    setOpen(false);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!open) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && filtered[activeIdx]) {
      e.preventDefault();
      pick(filtered[activeIdx]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div className="relative">
      <div className="relative">
        <MapPin
          className={cn(
            "pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2",
            valid ? "text-status-delivered" : "text-status-cancelled"
          )}
        />
        <input
          ref={inputRef}
          value={open ? query : value}
          disabled={disabled}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            setActiveIdx(0);
          }}
          onFocus={() => {
            setQuery("");
            setOpen(true);
          }}
          onKeyDown={handleKeyDown}
          placeholder="Gouvernorat..."
          className={cn(
            "h-9 w-full rounded-md border bg-surface pl-8 pr-7 text-sm focus-visible:outline-none focus-visible:ring-2 disabled:opacity-50",
            valid
              ? "border-border focus-visible:ring-primary"
              : "border-status-cancelled focus-visible:ring-status-cancelled"
          )}
        />
        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            setOpen((v) => !v);
            setQuery("");
            inputRef.current?.focus();
          }}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted hover:text-foreground"
        >
          <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} />
        </button>
      </div>

      {!valid && !open && (
        <div className="mt-1 flex items-start gap-1.5">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-status-cancelled" />
          <p className="text-[11px] text-status-cancelled">
            {value
              ? `"${value}" n'est pas un gouvernorat accepte par Cosmos.`
              : "Gouvernorat obligatoire pour l'expedition."}
            {suggestion && (
              <button
                type="button"
                onClick={() => pick(suggestion)}
                className="ml-1 font-semibold underline"
              >
                Utiliser {suggestion} ?
              </button>
            )}
          </p>
        </div>
      )}

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-[calc(100%+4px)] z-50 max-h-60 w-full min-w-[220px] overflow-y-auto rounded-lg border border-border bg-surface py-1 shadow-xl">
            {suggestion && !query && (
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(suggestion);
                }}
                className="flex w-full items-center gap-2 border-b border-border bg-primary-soft px-3 py-2 text-left"
              >
                <MapPin className="h-3.5 w-3.5 text-primary" />
                <div>
                  <p className="text-xs font-semibold text-primary">{suggestion}</p>
                  <p className="text-[10px] text-primary/70">suggere depuis l'adresse</p>
                </div>
              </button>
            )}

            {filtered.length === 0 ? (
              <p className="px-3 py-3 text-center text-xs text-muted">Aucun resultat</p>
            ) : (
              filtered.map((c, i) => (
                <button
                  key={c}
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    pick(c);
                  }}
                  onMouseEnter={() => setActiveIdx(i)}
                  className={cn(
                    "flex w-full items-center justify-between px-3 py-1.5 text-left text-xs transition-colors",
                    i === activeIdx ? "bg-primary-soft text-primary" : "hover:bg-surface-sunken"
                  )}
                >
                  {c}
                  {c === value && <Check className="h-3 w-3 text-primary" />}
                </button>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}