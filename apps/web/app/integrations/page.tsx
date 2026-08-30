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
  Plus, X, Truck, CheckCircle2, XCircle,
  Eye, EyeOff, RefreshCw, Trash2, Link, Unlink,
} from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api";

function getToken() {
  return window.localStorage.getItem("orderly_token");
}

function AddIntegrationModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("Cosmos");
  const [token, setToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function create() {
    if (!token.trim()) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${API}/delivery/integrations`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${getToken()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: name.trim(), token: token.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message ?? "Erreur");
      onCreated();
      onClose();
    } catch (e: any) {
      setError(e?.message ?? "Erreur");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-foreground/30 backdrop-blur-[2px]">
      <div className="w-full max-w-md rounded-xl border border-border bg-surface shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-sm font-semibold">Ajouter une intégration Cosmos</h2>
          <button onClick={onClose} className="rounded-md p-1 hover:bg-surface-sunken">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3 p-5">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">Nom</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="ex: Cosmos Principal"
              autoFocus
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">
              Token API Cosmos <span className="text-status-cancelled">*</span>
            </label>
            <div className="relative">
              <Input
                type={showToken ? "text" : "password"}
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                className="pr-8 font-mono text-xs"
              />
              <button
                type="button"
                onClick={() => setShowToken((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted"
              >
                {showToken ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </button>
            </div>
            <p className="mt-1 text-[11px] text-muted">
              Trouvez votre token dans cosmos.tn → API Tokens → Create Token
            </p>
          </div>

          {error && (
            <p className="rounded-md bg-status-cancelled-bg px-3 py-2 text-xs text-status-cancelled">
              {error}
            </p>
          )}
        </div>

        <div className="flex gap-2 border-t border-border px-5 py-4">
          <Button variant="secondary" className="flex-1" onClick={onClose}>Annuler</Button>
          <Button
            className="flex-1"
            disabled={loading || !token.trim()}
            onClick={create}
          >
            {loading ? "Création..." : "Créer"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function IntegrationCard({
  integration,
  allStores,
  onRefresh,
}: {
  integration: any;
  allStores: any[];
  onRefresh: () => void;
}) {
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [showToken, setShowToken] = useState(false);
  const [editToken, setEditToken] = useState("");
  const [showEditToken, setShowEditToken] = useState(false);
  const [editingToken, setEditingToken] = useState(false);

  const linkedIds = (integration.stores ?? []).map((s: any) => s.storeId);
  const unlinkedStores = allStores.filter(
    (s) => !linkedIds.includes(s.id)
  );

  async function test() {
    setBusy("test");
    setMsg(null);
    try {
      const res = await fetch(`${API}/delivery/integrations/${integration.id}/test`, {
        method: "POST",
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const data = await res.json();
      setMsg({ ok: data.ok, text: data.message ?? data.error ?? "Résultat inconnu" });
    } finally {
      setBusy("");
    }
  }

  async function sync() {
    setBusy("sync");
    setMsg(null);
    try {
      const res = await fetch(`${API}/delivery/cosmos/sync-all`, {
        method: "POST",
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const data = await res.json();
      setMsg({
        ok: data.ok,
        text: `${data.results?.reduce((s: number, r: any) => s + (r.updated ?? 0), 0) ?? 0} statuts mis à jour`,
      });
    } finally {
      setBusy("");
    }
  }

  async function saveToken() {
    if (!editToken.trim()) return;
    setBusy("save-token");
    try {
      await fetch(`${API}/delivery/integrations/${integration.id}/token`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${getToken()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ token: editToken.trim() }),
      });
      setMsg({ ok: true, text: "Token mis à jour" });
      setEditingToken(false);
      setEditToken("");
      onRefresh();
    } finally {
      setBusy("");
    }
  }

  async function linkStore(storeId: string) {
    setBusy(`link-${storeId}`);
    try {
      await fetch(`${API}/delivery/integrations/${integration.id}/link/${storeId}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      onRefresh();
    } finally {
      setBusy("");
    }
  }

  async function unlinkStore(storeId: string) {
    setBusy(`unlink-${storeId}`);
    try {
      await fetch(`${API}/delivery/integrations/${integration.id}/link/${storeId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      onRefresh();
    } finally {
      setBusy("");
    }
  }

  async function remove() {
    if (linkedIds.length > 0) {
      alert("Déliez tous les magasins avant de supprimer cette intégration.");
      return;
    }
    if (!window.confirm(`Supprimer l'intégration "${integration.name}" ?`)) return;
    await fetch(`${API}/delivery/integrations/${integration.id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    onRefresh();
  }

  const creds = integration.credentials ?? {};
  const hasToken = !!creds.token;

  return (
    <div className="rounded-xl border border-border bg-surface p-5 space-y-4">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
            <Truck className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-semibold">{integration.name}</p>
            <p className="text-xs text-muted">Cosmos · {linkedIds.length} magasin{linkedIds.length !== 1 ? "s" : ""} lié{linkedIds.length !== 1 ? "s" : ""}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={cn(
            "flex items-center gap-1 rounded px-2 py-1 text-xs font-medium",
            hasToken
              ? "bg-status-delivered-bg text-status-delivered"
              : "bg-status-cancelled-bg text-status-cancelled"
          )}>
            {hasToken ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
            {hasToken ? "Token configuré" : "Pas de token"}
          </span>
          <button
            onClick={remove}
            className="rounded-md p-1.5 text-muted hover:bg-status-cancelled-bg hover:text-status-cancelled"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Token */}
      <div className="rounded-lg border border-border bg-surface-sunken p-3 space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium text-muted">Token API</p>
          <button
            onClick={() => setEditingToken((v) => !v)}
            className="text-xs font-medium text-primary hover:underline"
          >
            {editingToken ? "Annuler" : "Modifier"}
          </button>
        </div>

        {editingToken ? (
          <div className="space-y-2">
            <div className="relative">
              <Input
                type={showEditToken ? "text" : "password"}
                value={editToken}
                onChange={(e) => setEditToken(e.target.value)}
                placeholder="Nouveau token..."
                className="h-8 pr-8 font-mono text-xs"
                autoFocus
              />
              <button
                type="button"
                onClick={() => setShowEditToken((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted"
              >
                {showEditToken ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
              </button>
            </div>
            <Button
              size="sm"
              className="w-full"
              disabled={busy === "save-token" || !editToken.trim()}
              onClick={saveToken}
            >
              {busy === "save-token" ? "Enregistrement..." : "Enregistrer le token"}
            </Button>
          </div>
        ) : (
          <p className="font-mono text-[11px] text-muted">
            {hasToken ? "●●●●●●●●●●●●●●●●●●●●" : "Aucun token"}
          </p>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <Button size="sm" variant="secondary" disabled={busy !== "" || !hasToken} onClick={test}>
          <CheckCircle2 className={cn("h-3.5 w-3.5", busy === "test" && "animate-spin")} />
          {busy === "test" ? "Test..." : "Tester"}
        </Button>
        <Button size="sm" variant="secondary" disabled={busy !== "" || !hasToken} onClick={sync}>
          <RefreshCw className={cn("h-3.5 w-3.5", busy === "sync" && "animate-spin")} />
          {busy === "sync" ? "Sync..." : "Synchroniser"}
        </Button>
      </div>

      {/* Linked stores */}
      <div className="space-y-2">
        <p className="text-xs font-medium text-muted">Magasins liés</p>

        {linkedIds.length === 0 && (
          <p className="text-[11px] text-muted-light">Aucun magasin lié — les commandes ne seront pas envoyées à Cosmos.</p>
        )}

        {(integration.stores ?? []).map((link: any) => (
          <div
            key={link.storeId}
            className="flex items-center justify-between rounded-lg border border-border px-3 py-2"
          >
            <span className="flex items-center gap-2 text-xs font-medium">
              <CheckCircle2 className="h-3.5 w-3.5 text-status-delivered" />
              {link.store?.name ?? link.storeId}
            </span>
            <button
              onClick={() => unlinkStore(link.storeId)}
              disabled={busy === `unlink-${link.storeId}`}
              className="flex items-center gap-1 text-[11px] text-muted hover:text-status-cancelled"
            >
              <Unlink className="h-3 w-3" />
              Délier
            </button>
          </div>
        ))}

        {unlinkedStores.length > 0 && (
          <div className="space-y-1">
            <p className="text-[11px] text-muted">Lier un magasin :</p>
            <div className="flex flex-wrap gap-1.5">
              {unlinkedStores.map((s) => (
                <button
                  key={s.id}
                  onClick={() => linkStore(s.id)}
                  disabled={busy === `link-${s.id}`}
                  className="flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-[11px] font-medium text-muted hover:border-primary hover:bg-primary-soft hover:text-primary transition-colors"
                >
                  <Link className="h-3 w-3" />
                  {s.name}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {msg && (
        <p className={cn(
          "rounded-md px-3 py-2 text-xs font-medium",
          msg.ok ? "bg-status-delivered-bg text-status-delivered" : "bg-status-cancelled-bg text-status-cancelled"
        )}>
          {msg.text}
        </p>
      )}
    </div>
  );
}

function IntegrationsContent() {
  const { canAccessStore } = useAuth();
  const { stores } = useStores();
  const [selectedStoreIds, setSelectedStoreIds] = useState<string[]>([]);
  const [integrations, setIntegrations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);

  const accessibleStores = stores.filter((s) => canAccessStore(s.id));

  useEffect(() => {
    if (stores.length > 0 && selectedStoreIds.length === 0) {
      setSelectedStoreIds(stores.map((s) => s.id));
    }
  }, [stores]);

  const fetchIntegrations = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/delivery/integrations`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const data = await res.json();
      setIntegrations(Array.isArray(data) ? data : []);
    } catch {
      setIntegrations([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchIntegrations();
  }, [fetchIntegrations]);

  return (
    <div className="flex h-screen bg-background">
      <Sidebar
        stores={accessibleStores}
        selectedStoreIds={selectedStoreIds}
        onChangeSelectedStores={setSelectedStoreIds}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-surface px-5">
          <div>
            <h1 className="text-base font-semibold">Intégrations</h1>
            <p className="text-xs text-muted">Gérez vos sociétés de livraison</p>
          </div>
          <Button size="sm" onClick={() => setShowAdd(true)}>
            <Plus className="h-3.5 w-3.5" />
            Ajouter Cosmos