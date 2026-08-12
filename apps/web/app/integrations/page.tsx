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
  Truck, ShoppingBag, Globe, CheckCircle2, XCircle,
  RefreshCw, Eye, EyeOff, Zap, AlertTriangle,
} from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api";

function getToken() {
  return window.localStorage.getItem("orderly_token");
}

interface CosmosStatus {
  connected: boolean;
  isActive?: boolean;
  hasToken?: boolean;
  updatedAt?: string;
}

function CosmosCard({ storeId, storeName }: { storeId: string; storeName: string }) {
  const [status, setStatus] = useState<CosmosStatus>({ connected: false });
  const [token, setToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`${API}/delivery/cosmos/${storeId}/status`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      setStatus(await res.json());
    } catch {}
  }, [storeId]);

  useEffect(() => { fetchStatus(); }, [fetchStatus]);

  async function save() {
    if (!token.trim()) return;
    setSaving(true);
    setResult(null);
    try {
      await fetch(`${API}/delivery/cosmos/${storeId}/config`, {
        method: "POST",
        headers: { Authorization: `Bearer ${getToken()}`, "Content-Type": "application/json" },
        body: JSON.stringify({ token: token.trim() }),
      });
      setToken("");
      await fetchStatus();
      setResult({ ok: true, msg: "Token enregistre" });
    } catch {
      setResult({ ok: false, msg: "Erreur lors de l'enregistrement" });
    } finally {
      setSaving(false);
    }
  }

  async function test() {
    setTesting(true);
    setResult(null);
    try {
      const res = await fetch(`${API}/delivery/cosmos/${storeId}/test`, {
        method: "POST",
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const data = await res.json();
      setResult({
        ok: data.ok,
        msg: data.ok ? "Connexion reussie a Cosmos" : `Echec : ${data.error ?? "inconnu"}`,
      });
    } catch {
      setResult({ ok: false, msg: "Erreur reseau" });
    } finally {
      setTesting(false);
    }
  }

  async function sync() {
    setSyncing(true);
    setResult(null);
    try {
      const res = await fetch(`${API}/delivery/cosmos/${storeId}/sync`, {
        method: "POST",
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const data = await res.json();
      setResult({
        ok: data.ok,
        msg: data.ok
          ? `${data.checked} commandes verifiees, ${data.updated} mises a jour`
          : `Echec : ${data.error}`,
      });
    } catch {
      setResult({ ok: false, msg: "Erreur reseau" });
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-soft">
            <Truck className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className="text-sm font-semibold">Cosmos</p>
            <p className="text-xs text-muted">Societe de livraison · {storeName}</p>
          </div>
        </div>
        <span className={cn(
          "flex items-center gap-1.5 rounded px-2 py-1 text-xs font-medium",
          status.connected
            ? "bg-status-delivered-bg text-status-delivered"
            : "bg-status-onhold-bg text-muted"
        )}>
          {status.connected ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
          {status.connected ? "Connecte" : "Non configure"}
        </span>
      </div>

      <div className="mt-4 space-y-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-muted">
            Token API Cosmos
          </label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Input
                type={showToken ? "text" : "password"}
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder={status.hasToken ? "Token deja enregistre — coller pour remplacer" : "Coller le token Bearer"}
                className="pr-8"
              />
              <button
                type="button"
                onClick={() => setShowToken((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted hover:text-foreground"
              >
                {showToken ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </button>
            </div>
            <Button size="sm" disabled={saving || !token.trim()} onClick={save}>
              {saving ? "..." : "Enregistrer"}
            </Button>
          </div>
        </div>

        <div className="flex gap-2">
          <Button size="sm" variant="secondary" disabled={testing || !status.hasToken} onClick={test}>
            <Zap className="h-3.5 w-3.5" />
            {testing ? "Test..." : "Tester la connexion"}
          </Button>
          <Button size="sm" variant="secondary" disabled={syncing || !status.connected} onClick={sync}>
            <RefreshCw className={cn("h-3.5 w-3.5", syncing && "animate-spin")} />
            {syncing ? "Sync..." : "Synchroniser les statuts"}
          </Button>
        </div>

        {result && (
          <p className={cn(
            "rounded-md px-3 py-2 text-xs font-medium",
            result.ok
              ? "bg-status-delivered-bg text-status-delivered"
              : "bg-status-cancelled-bg text-status-cancelled"
          )}>
            {result.msg}
          </p>
        )}

        <div className="rounded-lg bg-surface-sunken px-3 py-2.5 text-[11px] text-muted space-y-1">
          <p className="font-medium text-foreground">Comment ca marche</p>
          <p>1. Le colis est cree chez Cosmos quand la commande passe en "En preparation"</p>
          <p>2. Le tracking ID revient automatiquement et s'affiche sur la commande</p>
          <p>3. Les statuts de livraison sont recuperes via "Synchroniser"</p>
          <p>4. Le statut "Paye" reste modifiable uniquement via l'import Excel</p>
        </div>
      </div>
    </div>
  );
}

function ShopifyCard({ storeId, storeName }: { storeId: string; storeName: string }) {
  const [token, setToken] = useState("");
  const [domain, setDomain] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);

  async function save() {
    if (!token.trim() || !domain.trim()) return;
    setSaving(true);
    setResult(null);
    try {
      const res = await fetch(`${API}/stores/${storeId}/credentials`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${getToken()}`, "Content-Type": "application/json" },
        body: JSON.stringify({ shopDomain: domain.trim(), accessToken: token.trim() }),
      });
      if (!res.ok) throw new Error();
      setToken("");
      setResult({ ok: true, msg: "Credentials Shopify enregistres" });
    } catch {
      setResult({ ok: false, msg: "Erreur lors de l'enregistrement" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-status-delivered-bg">
          <ShoppingBag className="h-5 w-5 text-status-delivered" />
        </div>
        <div>
          <p className="text-sm font-semibold">Shopify</p>
          <p className="text-xs text-muted">Source de commandes · {storeName}</p>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-muted">Domaine boutique</label>
          <Input
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            placeholder="votre-boutique.myshopify.com"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted">
            Access token (commence par shpat_)
          </label>
          <div className="relative">
            <Input
              type={showToken ? "text" : "password"}
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="shpat_..."
              className="pr-8"
            />
            <button
              type="button"
              onClick={() => setShowToken((v) => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted hover:text-foreground"
            >
              {showToken ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            </button>
          </div>
        </div>

        <Button size="sm" disabled={saving || !token.trim() || !domain.trim()} onClick={save}>
          {saving ? "..." : "Enregistrer"}
        </Button>

        {result && (
          <p className={cn(
            "rounded-md px-3 py-2 text-xs font-medium",
            result.ok
              ? "bg-status-delivered-bg text-status-delivered"
              : "bg-status-cancelled-bg text-status-cancelled"
          )}>
            {result.msg}
          </p>
        )}

        <div className="rounded-lg bg-surface-sunken px-3 py-2.5 text-[11px] text-muted space-y-1">
          <p className="font-medium text-foreground">Ou trouver le token</p>
          <p>Shopify Admin → Settings → Apps and sales channels → Develop apps</p>
          <p>→ Create an app → Configure Admin API scopes</p>
          <p>→ Cocher read_products, read_orders, write_orders, read_inventory</p>
          <p>→ Install app → Reveal token once</p>
        </div>
      </div>
    </div>
  );
}

function ConvertyCard({ storeName }: { storeName: string }) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-surface p-5 opacity-70">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-surface-sunken">
            <Globe className="h-5 w-5 text-muted" />
          </div>
          <div>
            <p className="text-sm font-semibold">Converty</p>
            <p className="text-xs text-muted">Source de commandes · {storeName}</p>
          </div>
        </div>
        <span className="rounded bg-status-processing-bg px-2 py-1 text-xs font-medium text-status-processing">
          En attente
        </span>
      </div>

      <div className="mt-4 rounded-lg bg-surface-sunken px-3 py-2.5 text-[11px] text-muted space-y-1">
        <p className="font-medium text-foreground">Credentials requis</p>
        <p>En attente du client_id et client_secret de Converty.</p>
        <p className="mt-1 font-mono text-[10px]">
          Redirect URI a enregistrer chez eux :
        </p>
        <p className="font-mono text-[10px] break-all text-foreground">
          {API.replace("/api", "")}/api/integrations/converty/callback
        </p>
      </div>
    </div>
  );
}

function IntegrationsContent() {
  const { canAccessStore } = useAuth();
  const { stores } = useStores();
  const [selectedStoreIds, setSelectedStoreIds] = useState<string[]>([]);

  const accessibleStores = stores.filter((s) => canAccessStore(s.id));

  useEffect(() => {
    if (stores.length > 0 && selectedStoreIds.length === 0) {
      setSelectedStoreIds(stores.map((s) => s.id));
    }
  }, [stores]);

  const visible = accessibleStores.filter((s) => selectedStoreIds.includes(s.id));

  return (
    <div className="flex h-screen bg-background">
      <Sidebar
        stores={accessibleStores}
        selectedStoreIds={selectedStoreIds}
        onChangeSelectedStores={setSelectedStoreIds}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-surface px-5">
          <h1 className="text-base font-semibold">Integrations</h1>
        </header>

        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {visible.length === 0 && (
            <p className="py-16 text-center text-sm text-muted">Aucun magasin selectionne</p>
          )}

          {visible.map((store) => (
            <div key={store.id} className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                {store.name}
              </p>
              <div className="grid grid-cols-2 gap-4">
                <CosmosCard storeId={store.id} storeName={store.name} />
                <ShopifyCard storeId={store.id} storeName={store.name} />
                <ConvertyCard storeName={store.name} />
              </div>
            </div>
          ))}

          <div className="flex items-start gap-2.5 rounded-lg border border-status-processing/30 bg-status-processing-bg px-4 py-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-status-processing" />
            <div className="text-xs text-status-processing">
              <p className="font-semibold">Mapping des statuts Cosmos</p>
              <p className="mt-0.5">
                Le mapping actuel est base sur des noms de statuts supposes. Il devra etre ajuste
                quand Cosmos confirmera leur liste exacte de statuts.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function IntegrationsPage() {
  return (
    <RouteGuard>
      <IntegrationsContent />
    </RouteGuard>
  );
}