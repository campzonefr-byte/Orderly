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
  Users, Send, Zap, Plus, X, Trash2, Play, Pause,
  Megaphone, Eye, CheckCircle2, AlertTriangle, Sparkles,
} from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api";

function getToken() {
  return window.localStorage.getItem("orderly_token");
}

function money(n: number) {
  return n.toLocaleString("fr-FR", { maximumFractionDigits: 0 });
}

interface Segment {
  id: string;
  name: string;
  description: string | null;
  rules: any;
  isSystem: boolean;
  size: number;
}

interface Campaign {
  id: string;
  name: string;
  message: string;
  segmentId: string | null;
  segment?: { name: string };
  status: string;
  recipientCount: number;
  sentCount: number;
  failedCount: number;
  sentAt: string | null;
  createdAt: string;
}

interface Flow {
  id: string;
  name: string;
  description: string | null;
  trigger: string;
  triggerConfig: any;
  segmentId: string | null;
  segment?: { name: string };
  message: string;
  delayHours: number;
  isActive: boolean;
  totalSent: number;
}

const TRIGGERS = [
  { key: "LOW_STOCK", label: "Stock bientôt épuisé", desc: "Quand un produit passe sous le seuil" },
  { key: "NEW_PRODUCT", label: "Nouveau produit", desc: "Quand un produit est ajouté" },
  { key: "INACTIVE_CUSTOMER", label: "Client inactif", desc: "Après X jours sans commande" },
  { key: "AFTER_DELIVERY", label: "Après livraison", desc: "Message de satisfaction" },
  { key: "ABANDONED", label: "Commande non confirmée", desc: "Relance après tentatives" },
];

const VARIABLES = ["{{nom}}", "{{ville}}", "{{commandes}}", "{{valeur}}", "{{produit}}"];

const STATUS_STYLE: Record<string, string> = {
  DRAFT: "bg-surface-sunken text-muted",
  SCHEDULED: "bg-status-processing-bg text-status-processing",
  SENDING: "bg-status-shipped-bg text-status-shipped",
  SENT: "bg-status-delivered-bg text-status-delivered",
  FAILED: "bg-status-cancelled-bg text-status-cancelled",
};

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Brouillon",
  SCHEDULED: "Programmée",
  SENDING: "Envoi en cours",
  SENT: "Envoyée",
  FAILED: "Échec",
};

function SegmentModal({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [minOrders, setMinOrders] = useState("");
  const [minLtv, setMinLtv] = useState("");
  const [inactiveDays, setInactiveDays] = useState("");
  const [maxReturnRate, setMaxReturnRate] = useState("");
  const [minConfirmationRate, setMinConfirmationRate] = useState("");
  const [preview, setPreview] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  function buildRules() {
    const r: any = {};
    if (minOrders) r.minOrders = parseInt(minOrders);
    if (minLtv) r.minLtv = parseFloat(minLtv);
    if (inactiveDays) r.inactiveDays = parseInt(inactiveDays);
    if (maxReturnRate) r.maxReturnRate = parseInt(maxReturnRate);
    if (minConfirmationRate) r.minConfirmationRate = parseInt(minConfirmationRate);
    return r;
  }

  async function doPreview() {
    try {
      const res = await fetch(`${API}/marketing/segments/preview`, {
        method: "POST",
        headers: { Authorization: `Bearer ${getToken()}`, "Content-Type": "application/json" },
        body: JSON.stringify({ rules: buildRules() }),
      });
      setPreview(await res.json());
    } catch {}
  }

  async function save() {
    setLoading(true);
    try {
      await fetch(`${API}/marketing/segments`, {
        method: "POST",
        headers: { Authorization: `Bearer ${getToken()}`, "Content-Type": "application/json" },
        body: JSON.stringify({ name, description, rules: buildRules() }),
      });
      onSaved();
      onClose();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-foreground/30 backdrop-blur-[2px]">
      <div className="w-full max-w-lg rounded-xl border border-border bg-surface shadow-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-sm font-semibold">Nouveau segment</h2>
          <button onClick={onClose} className="rounded-md p-1 hover:bg-surface-sunken">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">Nom du segment</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="ex: Gros acheteurs Tunis" autoFocus />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">Description</label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optionnel" />
          </div>

          <div className="rounded-lg border border-border p-3.5 space-y-3">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted">Critères</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-[11px] text-muted">Commandes min.</label>
                <Input type="number" value={minOrders} onChange={(e) => setMinOrders(e.target.value)} placeholder="ex: 2" className="h-8 text-xs" />
              </div>
              <div>
                <label className="mb-1 block text-[11px] text-muted">Valeur min. (TND)</label>
                <Input type="number" value={minLtv} onChange={(e) => setMinLtv(e.target.value)} placeholder="ex: 500" className="h-8 text-xs" />
              </div>
              <div>
                <label className="mb-1 block text-[11px] text-muted">Inactif depuis (jours)</label>
                <Input type="number" value={inactiveDays} onChange={(e) => setInactiveDays(e.target.value)} placeholder="ex: 30" className="h-8 text-xs" />
              </div>
              <div>
                <label className="mb-1 block text-[11px] text-muted">Retours max. (%)</label>
                <Input type="number" value={maxReturnRate} onChange={(e) => setMaxReturnRate(e.target.value)} placeholder="ex: 20" className="h-8 text-xs" />
              </div>
              <div className="col-span-2">
                <label className="mb-1 block text-[11px] text-muted">Taux confirmation min. (%)</label>
                <Input type="number" value={minConfirmationRate} onChange={(e) => setMinConfirmationRate(e.target.value)} placeholder="ex: 70" className="h-8 text-xs" />
              </div>
            </div>
            <Button size="sm" variant="secondary" className="w-full" onClick={doPreview}>
              <Eye className="h-3.5 w-3.5" />
              Aperçu du segment
            </Button>
          </div>

          {preview && (
            <div className="rounded-lg border-2 border-primary bg-primary-soft p-3.5">
              <div className="flex items-baseline gap-2">
                <p className="text-2xl font-bold text-primary">{preview.size}</p>
                <p className="text-xs text-primary">clients correspondent</p>
              </div>
              <p className="mt-1 text-[11px] text-primary/70">
                Valeur cumulée : {money(preview.totalValue)} TND
              </p>
              {preview.sample?.length > 0 && (
                <div className="mt-2 space-y-0.5">
                  {preview.sample.slice(0, 4).map((s: any, i: number) => (
                    <p key={i} className="text-[11px] text-primary/80">
                      {s.name} · {s.totalOrders} cmd · {money(s.lifetimeValue)} TND
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex gap-2 border-t border-border px-5 py-4">
          <Button variant="secondary" className="flex-1" onClick={onClose}>Annuler</Button>
          <Button className="flex-1" disabled={loading || !name.trim()} onClick={save}>
            {loading ? "Création..." : "Créer le segment"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function CampaignModal({
  segments,
  onClose,
  onSaved,
}: {
  segments: Segment[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [segmentId, setSegmentId] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const selected = segments.find((s) => s.id === segmentId);

  function insertVar(v: string) {
    setMessage((m) => m + v);
  }

  async function save() {
    setLoading(true);
    try {
      await fetch(`${API}/marketing/campaigns`, {
        method: "POST",
        headers: { Authorization: `Bearer ${getToken()}`, "Content-Type": "application/json" },
        body: JSON.stringify({ name, message, segmentId }),
      });
      onSaved();
      onClose();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-foreground/30 backdrop-blur-[2px]">
      <div className="w-full max-w-lg rounded-xl border border-border bg-surface shadow-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-sm font-semibold">Nouvelle campagne SMS</h2>
          <button onClick={onClose} className="rounded-md p-1 hover:bg-surface-sunken">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">Nom de la campagne</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="ex: Promo Ramadan" autoFocus />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-muted">Segment cible</label>
            <select
              value={segmentId}
              onChange={(e) => setSegmentId(e.target.value)}
              className="h-9 w-full rounded-md border border-border bg-surface px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <option value="">Choisir un segment...</option>
              {segments.map((s) => (
                <option key={s.id} value={s.id}>{s.name} ({s.size} clients)</option>
              ))}
            </select>
            {selected && (
              <p className="mt-1 text-[11px] text-primary">
                {selected.size} clients recevront ce message
              </p>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-medium text-muted">Message</label>
              <span className={cn("text-[10px]", message.length > 160 ? "text-status-cancelled" : "text-muted")}>
                {message.length}/160
              </span>
            </div>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
              placeholder="Bonjour {{nom}}, profitez de -20% sur votre prochaine commande !"
              className="w-full resize-none rounded-md border border-border bg-surface px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            />
            <div className="mt-2 flex flex-wrap gap-1.5">
              {VARIABLES.map((v) => (
                <button
                  key={v}
                  onClick={() => insertVar(v)}
                  className="rounded-full border border-border px-2 py-0.5 font-mono text-[10px] text-muted hover:border-primary hover:text-primary"
                >
                  {v}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex gap-2 border-t border-border px-5 py-4">
          <Button variant="secondary" className="flex-1" onClick={onClose}>Annuler</Button>
          <Button className="flex-1" disabled={loading || !name.trim() || !message.trim() || !segmentId} onClick={save}>
            {loading ? "Création..." : "Créer la campagne"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function FlowModal({
  segments,
  onClose,
  onSaved,
}: {
  segments: Segment[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [trigger, setTrigger] = useState("");
  const [segmentId, setSegmentId] = useState("");
  const [message, setMessage] = useState("");
  const [days, setDays] = useState("30");
  const [loading, setLoading] = useState(false);

  async function save() {
    setLoading(true);
    try {
      await fetch(`${API}/marketing/flows`, {
        method: "POST",
        headers: { Authorization: `Bearer ${getToken()}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          trigger,
          triggerConfig: { days: parseInt(days) || 30 },
          segmentId: segmentId || undefined,
          message,
        }),
      });
      onSaved();
      onClose();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-foreground/30 backdrop-blur-[2px]">
      <div className="w-full max-w-lg rounded-xl border border-border bg-surface shadow-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-sm font-semibold">Nouveau flow automatisé</h2>
          <button onClick={onClose} className="rounded-md p-1 hover:bg-surface-sunken">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">Nom du flow</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="ex: Relance clients inactifs" autoFocus />
          </div>

          <div>
            <label className="mb-2 block text-xs font-medium text-muted">Déclencheur</label>
            <div className="space-y-1.5">
              {TRIGGERS.map((t) => (
                <button
                  key={t.key}
                  onClick={() => setTrigger(t.key)}
                  className={cn(
                    "flex w-full items-start gap-2.5 rounded-lg border-2 px-3 py-2 text-left transition-colors",
                    trigger === t.key
                      ? "border-primary bg-primary-soft"
                      : "border-border hover:border-border-strong"
                  )}
                >
                  <Zap className={cn("mt-0.5 h-3.5 w-3.5 shrink-0", trigger === t.key ? "text-primary" : "text-muted")} />
                  <div>
                    <p className={cn("text-xs font-medium", trigger === t.key && "text-primary")}>{t.label}</p>
                    <p className="text-[11px] text-muted">{t.desc}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {trigger === "INACTIVE_CUSTOMER" && (
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">Après combien de jours ?</label>
              <Input type="number" value={days} onChange={(e) => setDays(e.target.value)} min={1} />
            </div>
          )}

          <div>
            <label className="mb-1 block text-xs font-medium text-muted">Segment (optionnel)</label>
            <select
              value={segmentId}
              onChange={(e) => setSegmentId(e.target.value)}
              className="h-9 w-full rounded-md border border-border bg-surface px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <option value="">Tous les clients concernés</option>
              {segments.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-muted">Message</label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={3}
              placeholder="Bonjour {{nom}}, ça fait longtemps ! -15% sur votre retour."
              className="w-full resize-none rounded-md border border-border bg-surface px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            />
            <div className="mt-2 flex flex-wrap gap-1.5">
              {VARIABLES.map((v) => (
                <button
                  key={v}
                  onClick={() => setMessage((m) => m + v)}
                  className="rounded-full border border-border px-2 py-0.5 font-mono text-[10px] text-muted hover:border-primary hover:text-primary"
                >
                  {v}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex gap-2 border-t border-border px-5 py-4">
          <Button variant="secondary" className="flex-1" onClick={onClose}>Annuler</Button>
          <Button className="flex-1" disabled={loading || !name.trim() || !trigger || !message.trim()} onClick={save}>
            {loading ? "Création..." : "Créer le flow"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function MarketingContent() {
  const { canAccessStore } = useAuth();
  const { stores } = useStores();
  const [selectedStoreIds, setSelectedStoreIds] = useState<string[]>([]);
  const [tab, setTab] = useState<"segments" | "campaigns" | "flows">("segments");

  const [segments, setSegments] = useState<Segment[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [flows, setFlows] = useState<Flow[]>([]);
  const [loading, setLoading] = useState(true);

  const [showSegment, setShowSegment] = useState(false);
  const [showCampaign, setShowCampaign] = useState(false);
  const [showFlow, setShowFlow] = useState(false);
  const [sending, setSending] = useState<string | null>(null);

  const accessibleStores = stores.filter((s) => canAccessStore(s.id));

  useEffect(() => {
    if (stores.length > 0 && selectedStoreIds.length === 0) {
      setSelectedStoreIds(stores.map((s) => s.id));
    }
  }, [stores]);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const h = { Authorization: `Bearer ${getToken()}` };
      const [s, c, f] = await Promise.all([
        fetch(`${API}/marketing/segments`, { headers: h }).then((r) => r.json()),
        fetch(`${API}/marketing/campaigns`, { headers: h }).then((r) => r.json()),
        fetch(`${API}/marketing/flows`, { headers: h }).then((r) => r.json()),
      ]);
      setSegments(Array.isArray(s) ? s : []);
      setCampaigns(Array.isArray(c) ? c : []);
      setFlows(Array.isArray(f) ? f : []);
    } catch {
      setSegments([]); setCampaigns([]); setFlows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  async function seedSegments() {
    await fetch(`${API}/marketing/segments/seed`, {
      method: "POST",
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    fetchAll();
  }

  async function sendCampaign(id: string) {
    if (!window.confirm("Envoyer cette campagne maintenant ?")) return;
    setSending(id);
    try {
      const res = await fetch(`${API}/marketing/campaigns/${id}/send`, {
        method: "POST",
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const data = await res.json();
      alert(`Campagne traitée.\nEnvoyés : ${data.sentCount}\nÉchecs : ${data.failedCount}\n\nNote : configurez SMS_API_KEY et SMS_API_URL sur Railway pour l'envoi réel.`);
      fetchAll();
    } finally {
      setSending(null);
    }
  }

  async function toggleFlow(id: string) {
    await fetch(`${API}/marketing/flows/${id}/toggle`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    fetchAll();
  }

  async function del(kind: string, id: string) {
    if (!window.confirm("Supprimer ?")) return;
    await fetch(`${API}/marketing/${kind}/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    fetchAll();
  }

  const totalReach = segments.reduce((s, x) => s + x.size, 0);
  const activeFlows = flows.filter((f) => f.isActive).length;
  const totalSent = campaigns.reduce((s, c) => s + c.sentCount, 0);

  return (
    <div className="flex h-screen bg-background">
      <Sidebar
        stores={accessibleStores}
        selectedStoreIds={selectedStoreIds}
        onChangeSelectedStores={setSelectedStoreIds}
      />

      <div className="flex min-w-0 flex-1 flex-col pt-14 md:pt-0">
        <header className="flex min-h-14 w-full max-w-full shrink-0 flex-wrap items-center justify-between gap-2 overflow-hidden border-b border-border bg-surface px-3 py-2 md:h-14 md:flex-nowrap md:px-5 md:py-0">
          <h1 className="text-base font-semibold">Marketing</h1>
          <div className="flex items-center gap-2">
            {segments.length === 0 && (
              <Button size="sm" variant="secondary" onClick={seedSegments}>
                <Sparkles className="h-3.5 w-3.5" />
                Créer les segments par défaut
              </Button>
            )}
            <Button size="sm" onClick={() => {
              if (tab === "segments") setShowSegment(true);
              else if (tab === "campaigns") setShowCampaign(true);
              else setShowFlow(true);
            }}>
              <Plus className="h-3.5 w-3.5" />
              {tab === "segments" ? "Segment" : tab === "campaigns" ? "Campagne" : "Flow"}
            </Button>
          </div>
        </header>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-3 border-b border-border bg-surface p-4">
          <div className="rounded-lg bg-surface-sunken px-4 py-3">
            <p className="text-[11px] font-medium text-muted">Segments</p>
            <p className="mt-1 text-2xl font-bold">{segments.length}</p>
          </div>
          <div className="rounded-lg bg-primary-soft px-4 py-3">
            <p className="text-[11px] font-medium text-primary">Portée cumulée</p>
            <p className="mt-1 text-2xl font-bold text-primary">{totalReach}</p>
          </div>
          <div className="rounded-lg bg-status-delivered-bg px-4 py-3">
            <p className="text-[11px] font-medium text-status-delivered">SMS envoyés</p>
            <p className="mt-1 text-2xl font-bold text-status-delivered">{totalSent}</p>
          </div>
          <div className="rounded-lg bg-purple-50 px-4 py-3">
            <p className="text-[11px] font-medium text-purple-600">Flows actifs</p>
            <p className="mt-1 text-2xl font-bold text-purple-600">{activeFlows}</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-border bg-surface px-5 py-2">
          {[
            { key: "segments", label: "Segments", icon: Users, count: segments.length },
            { key: "campaigns", label: "Campagnes", icon: Megaphone, count: campaigns.length },
            { key: "flows", label: "Automatisations", icon: Zap, count: flows.length },
          ].map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key as any)}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                  tab === t.key ? "bg-primary-soft text-primary" : "text-muted hover:bg-surface-sunken"
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {t.label}
                <span className={cn(
                  "rounded-full px-1.5 py-0.5 text-[10px]",
                  tab === t.key ? "bg-primary text-white" : "bg-surface-sunken"
                )}>{t.count}</span>
              </button>
            );
          })}
        </div>

        <div className="flex-1 overflow-auto p-5">
          {loading ? (
            <p className="py-16 text-center text-sm text-muted">Chargement...</p>
          ) : tab === "segments" ? (
            segments.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-24">
                <Users className="h-8 w-8 text-muted-light" />
                <p className="mt-2 text-sm font-medium">Aucun segment</p>
                <p className="mt-1 text-xs text-muted">Créez des listes dynamiques de clients ciblés.</p>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-3">
                {segments.map((s) => (
                  <div key={s.id} className="rounded-xl border border-border bg-surface p-4">
                    <div className="flex items-start justify-between">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">{s.name}</p>
                        {s.description && (
                          <p className="mt-0.5 text-[11px] text-muted">{s.description}</p>
                        )}
                      </div>
                      {!s.isSystem && (
                        <button onClick={() => del("segments", s.id)} className="text-muted hover:text-status-cancelled">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                    <div className="mt-3 flex items-baseline gap-1.5">
                      <p className="text-2xl font-bold text-primary">{s.size}</p>
                      <p className="text-xs text-muted">clients</p>
                    </div>
                    {s.isSystem && (
                      <span className="mt-2 inline-block rounded bg-surface-sunken px-1.5 py-0.5 text-[10px] text-muted">
                        Système
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )
          ) : tab === "campaigns" ? (
            campaigns.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-24">
                <Megaphone className="h-8 w-8 text-muted-light" />
                <p className="mt-2 text-sm font-medium">Aucune campagne</p>
              </div>
            ) : (
              <div className="rounded-xl border border-border bg-surface overflow-hidden">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-border bg-surface-sunken text-left text-xs font-medium text-muted">
                      <th className="px-5 py-3">Campagne</th>
                      <th className="px-4 py-3">Segment</th>
                      <th className="px-4 py-3">Destinataires</th>
                      <th className="px-4 py-3">Envoyés</th>
                      <th className="px-4 py-3">Statut</th>
                      <th className="px-4 py-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {campaigns.map((c) => (
                      <tr key={c.id} className="border-b border-border hover:bg-surface-sunken transition-colors">
                        <td className="px-5 py-3">
                          <p className="text-sm font-medium">{c.name}</p>
                          <p className="mt-0.5 truncate max-w-[280px] text-[11px] text-muted">{c.message}</p>
                        </td>
                        <td className="px-4 py-3 text-xs text-muted">{c.segment?.name ?? "—"}</td>
                        <td className="px-4 py-3 font-mono text-sm">{c.recipientCount}</td>
                        <td className="px-4 py-3">
                          <span className="font-mono text-sm text-status-delivered">{c.sentCount}</span>
                          {c.failedCount > 0 && (
                            <span className="ml-1 font-mono text-xs text-status-cancelled">/{c.failedCount} échecs</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className={cn("rounded px-2 py-1 text-xs font-medium", STATUS_STYLE[c.status])}>
                            {STATUS_LABEL[c.status] ?? c.status}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            {(c.status === "DRAFT" || c.status === "SCHEDULED") && (
                              <Button size="sm" disabled={sending === c.id} onClick={() => sendCampaign(c.id)}>
                                <Send className="h-3.5 w-3.5" />
                                {sending === c.id ? "Envoi..." : "Envoyer"}
                              </Button>
                            )}
                            <button onClick={() => del("campaigns", c.id)} className="rounded-md p-1.5 text-muted hover:text-status-cancelled">
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          ) : (
            flows.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-24">
                <Zap className="h-8 w-8 text-muted-light" />
                <p className="mt-2 text-sm font-medium">Aucune automatisation</p>
                <p className="mt-1 text-xs text-muted">Créez des flows déclenchés automatiquement.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {flows.map((f) => {
                  const trig = TRIGGERS.find((t) => t.key === f.trigger);
                  return (
                    <div key={f.id} className={cn(
                      "flex items-center gap-4 rounded-xl border-2 bg-surface p-4",
                      f.isActive ? "border-status-delivered/40" : "border-border"
                    )}>
                      <div className={cn(
                        "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
                        f.isActive ? "bg-status-delivered-bg" : "bg-surface-sunken"
                      )}>
                        <Zap className={cn("h-5 w-5", f.isActive ? "text-status-delivered" : "text-muted")} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold">{f.name}</p>
                          <span className={cn(
                            "rounded px-1.5 py-0.5 text-[10px] font-medium",
                            f.isActive ? "bg-status-delivered-bg text-status-delivered" : "bg-surface-sunken text-muted"
                          )}>
                            {f.isActive ? "Actif" : "Inactif"}
                          </span>
                        </div>
                        <p className="mt-0.5 text-[11px] text-muted">
                          Déclencheur : {trig?.label ?? f.trigger}
                          {f.segment && ` · Segment : ${f.segment.name}`}
                        </p>
                        <p className="mt-1 truncate text-[11px] text-muted-light">{f.message}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className="font-mono text-xs text-muted">{f.totalSent} envoyés</span>
                        <Button size="sm" variant={f.isActive ? "secondary" : "default"} onClick={() => toggleFlow(f.id)}>
                          {f.isActive ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                          {f.isActive ? "Pause" : "Activer"}
                        </Button>
                        <button onClick={() => del("flows", f.id)} className="rounded-md p-1.5 text-muted hover:text-status-cancelled">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          )}

          {/* SMS config warning */}
          <div className="mt-5 flex items-start gap-2.5 rounded-lg border border-status-processing/30 bg-status-processing-bg px-4 py-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-status-processing" />
            <div className="text-xs text-status-processing">
              <p className="font-semibold">Fournisseur SMS non configuré</p>
              <p className="mt-0.5">
                Ajoutez <span className="font-mono">SMS_API_KEY</span> et <span className="font-mono">SMS_API_URL</span> dans
                les variables Railway pour activer l'envoi réel. En attendant, les envois sont simulés.
              </p>
            </div>
          </div>
        </div>
      </div>

      {showSegment && <SegmentModal onClose={() => setShowSegment(false)} onSaved={fetchAll} />}
      {showCampaign && <CampaignModal segments={segments} onClose={() => setShowCampaign(false)} onSaved={fetchAll} />}
      {showFlow && <FlowModal segments={segments} onClose={() => setShowFlow(false)} onSaved={fetchAll} />}
    </div>
  );
}

export default function MarketingPage() {
  return (
    <RouteGuard>
      <MarketingContent />
    </RouteGuard>
  );
}