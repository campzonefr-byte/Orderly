"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar";
import { RouteGuard } from "@/components/auth/route-guard";
import { useStores } from "@/lib/stores-context";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  Plus, X, ShoppingBag, Globe, Settings2, CheckCircle2,
  XCircle, Trash2, ExternalLink, Eye, EyeOff,
  RefreshCw, Download, Store as StoreIcon, ChevronDown,
  ChevronUp, Info,
} from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api";

function getToken() {
  return window.localStorage.getItem("orderly_token");
}

interface StoreRow {
  id: string;
  name: string;
  sourceType: string;
  isActive: boolean;
  orderCount?: number;
  createdAt?: string;
}

// ─── Add Store Modal ───────────────────────────────────────────────────────────

function AddStoreModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [step, setStep] = useState<1 | 2>(1);
  const [source, setSource] = useState<"SHOPIFY" | "CONVERTY" | "CUSTOM" | null>(null);
  const [name, setName] = useState("");

  // Shopify fields
  const [shopDomain, setShopDomain] = useState("");
  const [shopToken, setShopToken] = useState("");
  const [showShopToken, setShowShopToken] = useState(false);
  const [shopClientId, setShopClientId] = useState("");
  const [shopClientSecret, setShopClientSecret] = useState("");
  const [showShopSecret, setShowShopSecret] = useState(false);
  const [shopInstructions, setShopInstructions] = useState(false);

  // Converty fields
  const [convertyClientId, setConvertyClientId] = useState("");
  const [convertySecret, setConvertySecret] = useState("");
  const [showConvertySecret, setShowConvertySecret] = useState(false);
  const [convertyInstructions, setConvertyInstructions] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function create() {
    if (!name.trim() || !source) return;
    setLoading(true);
    setError("");

    try {
      // Create the store
      const res = await fetch(`${API}/stores`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${getToken()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: name.trim(),
          sourceType: source === "CONVERTY" ? "MARKETPLACE" : source,
        }),
      });
      const store = await res.json();
      if (!res.ok || !store?.id) throw new Error("Création échouée");

      // Save Shopify credentials
      if (source === "SHOPIFY" && shopClientId.trim() && shopClientSecret.trim()) {
        await fetch(`${API}/integrations/shopify/${store.id}/setup`, {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${getToken()}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            clientId: shopClientId.trim(),
            clientSecret: shopClientSecret.trim(),
            shopDomain: shopDomain.trim() || undefined,
          }),
        });

        const authRes = await fetch(`${API}/integrations/shopify/${store.id}/auth-url`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${getToken()}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ shopDomain: shopDomain.trim() }),
        });
        const authData = await authRes.json();
        if (authData.ok && authData.url) {
          window.location.href = authData.url;
          return;
        }
      }

           // Save Converty credentials
           if (source === "CONVERTY" && convertyClientId.trim() && convertySecret.trim()) {
            await fetch(`${API}/integrations/converty/${store.id}/credentials`, {
              method: "PATCH",
              headers: {
                Authorization: `Bearer ${getToken()}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                clientId: convertyClientId.trim(),
                clientSecret: convertySecret.trim(),
              }),
            });
          }

      onCreated();
      onClose();
    } catch (e: any) {
      setError(e?.message ?? "Erreur");
    } finally {
      setLoading(false);
    }
  }

  const canCreate =
  name.trim() &&
  source &&
  (source === "CUSTOM" ||
    (source === "SHOPIFY" && shopDomain.trim() && shopClientId.trim() && shopClientSecret.trim()) ||
      (source === "CONVERTY" && convertyClientId.trim() && convertySecret.trim()));

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-foreground/30 backdrop-blur-[2px]">
      <div className="w-full max-w-lg rounded-xl border border-border bg-surface shadow-2xl max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold">Ajouter un magasin</h2>
            <p className="text-xs text-muted">
              {step === 1 ? "Étape 1 — Choisir la source" : `Étape 2 — Configurer ${source}`}
            </p>
          </div>
          <button onClick={onClose} className="rounded-md p-1 hover:bg-surface-sunken">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {step === 1 ? (
            <div className="space-y-2">
              {[
                {
                  key: "SHOPIFY" as const,
                  label: "Shopify",
                  desc: "Boutique Shopify — connectez via votre token d'accès",
                  icon: ShoppingBag,
                  tone: "bg-emerald-50 text-emerald-600 border-emerald-200",
                },
                {
                  key: "CONVERTY" as const,
                  label: "Converty",
                  desc: "Boutique Converty — connectez via votre app Converty",
                  icon: Globe,
                  tone: "bg-primary-soft text-primary border-primary/20",
                },
                {
                  key: "CUSTOM" as const,
                  label: "Manuel",
                  desc: "Commandes saisies manuellement, sans source externe",
                  icon: Settings2,
                  tone: "bg-surface-sunken text-muted border-border",
                },
              ].map((s) => {
                const Icon = s.icon;
                return (
                  <button
                    key={s.key}
                    onClick={() => { setSource(s.key); setStep(2); }}
                    className="flex w-full items-center gap-3 rounded-xl border-2 border-border p-4 text-left transition-colors hover:border-primary hover:bg-primary-soft/20"
                  >
                    <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border", s.tone)}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold">{s.label}</p>
                      <p className="text-[11px] text-muted">{s.desc}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-muted">Nom du magasin</label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={source === "SHOPIFY" ? "ex: Meday" : source === "CONVERTY" ? "ex: Shifa" : "ex: Boutique manuelle"}
                  autoFocus
                />
              </div>

              {source === "SHOPIFY" && (
                  <div className="space-y-3">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-muted">Domaine Shopify</label>
                      <Input
                        value={shopDomain}
                        onChange={(e) => setShopDomain(e.target.value)}
                        placeholder="votre-boutique.myshopify.com"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-muted">Client ID</label>
                      <Input
                        value={shopClientId}
                        onChange={(e) => setShopClientId(e.target.value)}
                        placeholder="db7b4594df893e391f0b7056701d3f1e"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-muted">Client Secret</label>
                      <div className="relative">
                        <Input
                          type={showShopSecret ? "text" : "password"}
                          value={shopClientSecret}
                          onChange={(e) => setShopClientSecret(e.target.value)}
                          placeholder="shpss_..."
                          className="pr-8"
                        />
                        <button
                          type="button"
                          onClick={() => setShowShopSecret((v) => !v)}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted"
                        >
                          {showShopSecret ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                        </button>
                      </div>
                    </div>

                    <button
                      onClick={() => setShopInstructions((v) => !v)}
                      className="flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
                    >
                      <Info className="h-3.5 w-3.5" />
                      Comment créer l'app Shopify ?
                      {shopInstructions ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                    </button>

                    {shopInstructions && (
                      <div className="rounded-lg bg-surface-sunken px-3 py-3 text-[11px] text-muted space-y-1.5">
                        <p className="font-semibold text-foreground">Dans Partners.shopify.com :</p>
                        <p>1. Apps → Create app → Create app manually</p>
                        <p>2. Nom : Orderly</p>
                        <p>3. App URL : <span className="font-mono">https://orderly-production-641f.up.railway.app</span></p>
                        <p>4. Redirect URL :</p>
                        <p className="font-mono pl-3 text-[10px] break-all">https://orderly-production-641f.up.railway.app/api/integrations/shopify/callback</p>
                        <p>5. Scopes : <span className="font-mono">read_products,read_inventory,read_orders,read_fulfillments</span></p>
                        <p>6. Legacy install flow : ON</p>
                        <p>7. Save → copier Client ID et Client Secret</p>
                      </div>
                    )}

                    <div className="rounded-lg bg-primary-soft px-3 py-2.5 text-[11px] text-primary">
                      <p className="font-semibold">Après avoir saisi les credentials</p>
                      <p className="mt-0.5">Vous serez redirigé vers Shopify pour autoriser la connexion.</p>
                    </div>
                  </div>
                )}

              {source === "CONVERTY" && (
                <div className="space-y-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-muted">Client ID</label>
                    <Input
                      value={convertyClientId}
                      onChange={(e) => setConvertyClientId(e.target.value)}
                      placeholder="ex: 6507a1b2c3d4e5f678901234"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-muted">Client Secret</label>
                    <div className="relative">
                      <Input
                        type={showConvertySecret ? "text" : "password"}
                        value={convertySecret}
                        onChange={(e) => setConvertySecret(e.target.value)}
                        placeholder="ex: f47ac10b-58cc-..."
                        className="pr-8"
                      />
                      <button
                        type="button"
                        onClick={() => setShowConvertySecret((v) => !v)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted"
                      >
                        {showConvertySecret ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                      </button>
                    </div>
                  </div>

                  <button
                    onClick={() => setConvertyInstructions((v) => !v)}
                    className="flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
                  >
                    <Info className="h-3.5 w-3.5" />
                    Comment obtenir les credentials ?
                    {convertyInstructions ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                  </button>

                  {convertyInstructions && (
                    <div className="rounded-lg bg-surface-sunken px-3 py-3 text-[11px] text-muted space-y-1.5">
                      <p className="font-semibold text-foreground">Dans votre Dashboard Converty :</p>
                      <p>1. Intégrations → Apps → Custom Apps</p>
                      <p>2. Create → Nommer "Orderly"</p>
                      <p>3. Redirect URL :</p>
                      <p className="font-mono pl-3 break-all text-[10px]">
                        {API.replace("/api", "")}/api/integrations/converty/callback
                      </p>
                      <p>4. Permissions → Cocher :</p>
                      <p className="font-mono pl-3">read-orders, read-products, read-stores, create-hooks</p>
                      <p>5. Créer → Copier le <span className="font-semibold">Client ID</span> et le <span className="font-semibold">Client Secret</span></p>
                      <p className="text-status-cancelled font-medium">⚠️ Le secret n'est visible qu'une seule fois !</p>
                    </div>
                  )}

                  <div className="rounded-lg bg-primary-soft px-3 py-2.5 text-[11px] text-primary">
                    <p className="font-semibold">Après avoir saisi les credentials</p>
                    <p className="mt-0.5">
                      Vous serez redirigé vers Converty pour autoriser la connexion.
                      Les commandes et produits seront ensuite importables.
                    </p>
                  </div>
                </div>
              )}

              {source === "CUSTOM" && (
                <div className="rounded-lg bg-surface-sunken px-3 py-2.5 text-[11px] text-muted">
                  Les commandes seront créées manuellement depuis Confirmation, Préparation ou la Messagerie.
                </div>
              )}

              {error && (
                <p className="rounded-md bg-status-cancelled-bg px-3 py-2 text-xs text-status-cancelled">
                  {error}
                </p>
              )}
            </div>
          )}
        </div>

        {step === 2 && (
          <div className="flex gap-2 border-t border-border px-5 py-4">
            <Button variant="secondary" onClick={() => setStep(1)}>Retour</Button>
            <Button
              className="flex-1"
              disabled={loading || !canCreate}
              onClick={create}
            >
              {loading ? "Création..." : "Créer le magasin"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Store Card ────────────────────────────────────────────────────────────────

function StoreCard({
  store,
  onDeleted,
  onRefresh,
}: {
  store: StoreRow;
  onDeleted: () => void;
  onRefresh: () => void;
}) {
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [shopifyConnected, setShopifyConnected] = useState(false);
  const [convertyConnected, setConvertyConnected] = useState(false);
  const [showEditCreds, setShowEditCreds] = useState(false);
  const [editClientId, setEditClientId] = useState("");
  const [editSecret, setEditSecret] = useState("");
  const [showEditSecret, setShowEditSecret] = useState(false);

  const isShopify = store.sourceType === "SHOPIFY";
  const isConverty = store.sourceType === "MARKETPLACE";
  const isCustom = !isShopify && !isConverty;

  useEffect(() => {
    if (isShopify) {
      fetch(`${API}/integrations/shopify/${store.id}/status`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      })
        .then((r) => r.json())
        .then((d) => setShopifyConnected(d?.connected ?? false))
        .catch(() => {});
    }
    if (isConverty) {
      fetch(`${API}/integrations/converty/${store.id}/status`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      })
        .then((r) => r.json())
        .then((d) => setConvertyConnected(d?.connected ?? false))
        .catch(() => {});
    }
  }, [store.id, isShopify, isConverty]);

  async function runAction(endpoint: string, method = "POST") {
    setBusy(endpoint);
    setMsg(null);
    try {
      const res = await fetch(`${API}/${endpoint}`, {
        method,
        headers: { Authorization: `Bearer ${getToken()}`, "Content-Type": "application/json" },
        body: method === "POST" ? JSON.stringify({}) : undefined,
      });
      const data = await res.json();
      if (data.ok !== false) {
        const detail =
          endpoint.includes("import-products")
            ? `${data.created ?? 0} créés, ${data.updated ?? 0} mis à jour`
            : endpoint.includes("import-orders")
            ? `${data.created ?? 0} importées`
            : endpoint.includes("register-webhooks")
            ? `${data.created ?? 0} créés, ${data.updated ?? 0} mis à jour`
            : "OK";
        setMsg({ ok: true, text: detail });
        onRefresh();
      } else {
        setMsg({ ok: false, text: data.error ?? "Échec" });
      }
    } catch {
      setMsg({ ok: false, text: "Erreur réseau" });
    } finally {
      setBusy("");
    }
  }
  async function saveCredentials() {
    if (!editClientId.trim() || !editSecret.trim()) return;
    setBusy("save-creds");
    try {
      const endpoint = isShopify
        ? `integrations/shopify/${store.id}/setup`
        : `integrations/converty/${store.id}/credentials`;

      const body = isShopify
        ? { clientId: editClientId.trim(), clientSecret: editSecret.trim() }
        : { clientId: editClientId.trim(), clientSecret: editSecret.trim() };

      await fetch(`${API}/${endpoint}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${getToken()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      setMsg({ ok: true, text: "Credentials enregistrés. Cliquez Connecter." });
      setShowEditCreds(false);
      setEditClientId("");
      setEditSecret("");
      onRefresh();
    } finally {
      setBusy("");
    }
  }
  async function remove() {
    if ((store.orderCount ?? 0) > 0) {
      alert(
        `Impossible de supprimer "${store.name}".\n\n` +
        `Ce magasin contient ${store.orderCount} commandes. ` +
        `La suppression entraînerait la perte de données et des doublons lors d'un nouvel import.\n\n` +
        `Utilisez "Modifier les credentials" pour reconnecter le magasin.`
      );
      return;
    }
    if (!window.confirm(`Supprimer le magasin ${store.name} ?`)) return;
    await fetch(`${API}/stores/${store.id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    onDeleted();
  }

  const Icon = isShopify ? ShoppingBag : isConverty ? Globe : Settings2;
  const tone = isShopify
    ? "bg-emerald-50 text-emerald-600"
    : isConverty
    ? "bg-primary-soft text-primary"
    : "bg-surface-sunken text-muted";

  const isConnected = isShopify ? shopifyConnected : isConverty ? convertyConnected : true;
  const provider = isShopify ? "shopify" : "converty";

  return (
    <div className="rounded-xl border border-border bg-surface p-5 space-y-4">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className={cn("flex h-10 w-10 items-center justify-center rounded-lg", tone)}>
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-semibold">{store.name}</p>
            <p className="text-xs text-muted">
              {isShopify ? "Shopify" : isConverty ? "Converty" : "Manuel"}
              {store.orderCount !== undefined && ` · ${store.orderCount} commandes`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!isCustom && (
            <span className={cn(
              "flex items-center gap-1 rounded px-2 py-1 text-xs font-medium",
              isConnected
                ? "bg-status-delivered-bg text-status-delivered"
                : "bg-status-cancelled-bg text-status-cancelled"
            )}>
              {isConnected
                ? <CheckCircle2 className="h-3 w-3" />
                : <XCircle className="h-3 w-3" />}
              {isConnected ? "Connecté" : "Non connecté"}
            </span>
          )}
          <button
            onClick={remove}
            className="rounded-md p-1.5 text-muted hover:bg-status-cancelled-bg hover:text-status-cancelled"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {!isCustom && isConnected && (
        <div className="flex flex-wrap gap-2">
                  <Button
            size="sm"
            variant="secondary"
            disabled={busy !== ""}
            onClick={() => runAction(
              isShopify
                ? `integrations/shopify/${store.id}/import-all-products`
                : `integrations/converty/${store.id}/import-products`
            )}
          >
            <Download className="h-3.5 w-3.5" />
            {busy.includes("import") ? "Import..." : "Importer produits"}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={busy !== ""}
            onClick={() => runAction(`integrations/${provider}/${store.id}/import-orders`)}
          >
            <Download className="h-3.5 w-3.5" />
            {busy.includes("import-orders") ? "Import..." : "Importer commandes"}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={busy !== ""}
            onClick={() => runAction(`integrations/${provider}/${store.id}/register-webhooks`)}
          >
            <RefreshCw className={cn("h-3.5 w-3.5", busy.includes("webhooks") && "animate-spin")} />
            Webhooks
          </Button>
        </div>
      )}
      {!isCustom && (
        <button
          onClick={() => setShowEditCreds((v) => !v)}
          className="flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
        >
          <Settings2 className="h-3.5 w-3.5" />
          {showEditCreds ? "Masquer" : "Modifier les credentials"}
        </button>
      )}

      {showEditCreds && (
        <div className="rounded-lg border border-border bg-surface-sunken p-3 space-y-2">
          <div>
            <label className="mb-1 block text-[11px] font-medium text-muted">Client ID</label>
            <Input
              value={editClientId}
              onChange={(e) => setEditClientId(e.target.value)}
              placeholder="Nouveau Client ID"
              className="h-8 text-xs"
            />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-medium text-muted">Client Secret</label>
            <div className="relative">
              <Input
                type={showEditSecret ? "text" : "password"}
                value={editSecret}
                onChange={(e) => setEditSecret(e.target.value)}
                placeholder="Nouveau Client Secret"
                className="h-8 pr-8 text-xs"
              />
              <button
                type="button"
                onClick={() => setShowEditSecret((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted"
              >
                {showEditSecret ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
              </button>
            </div>
          </div>
          <Button
            size="sm"
            className="w-full"
            disabled={busy !== "" || !editClientId.trim() || !editSecret.trim()}
            onClick={saveCredentials}
          >
            {busy === "save-creds" ? "Enregistrement..." : "Enregistrer"}
          </Button>
        </div>
      )}
{!isCustom && !isConnected && isConverty && (
        <Button
          size="sm"
          className="w-full"
          disabled={busy !== ""}
          onClick={async () => {
            setBusy("connect");
            try {
              const res = await fetch(`${API}/integrations/converty/${store.id}/auth-url`, {
                headers: { Authorization: `Bearer ${getToken()}` },
              });
              const data = await res.json();
              if (data.url) window.location.href = data.url;
              else setMsg({ ok: false, text: data.error ?? "Erreur" });
            } finally {
              setBusy("");
            }
          }}
        >
          Connecter Converty
        </Button>
      )}

      {!isCustom && !isConnected && isShopify && (
        <Button
          size="sm"
          className="w-full"
          disabled={busy !== ""}
          onClick={async () => {
            setBusy("connect");
            try {
              const res = await fetch(`${API}/integrations/shopify/${store.id}/auth-url`, {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${getToken()}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({}),
              });
              const data = await res.json();
              if (data.url) window.location.href = data.url;
              else setMsg({ ok: false, text: data.error ?? "Erreur" });
            } finally {
              setBusy("");
            }
          }}
        >
          Connecter Shopify
        </Button>
      )}

      {msg && (
        <p className={cn(
          "rounded-md px-3 py-2 text-xs font-medium",
          msg.ok
            ? "bg-status-delivered-bg text-status-delivered"
            : "bg-status-cancelled-bg text-status-cancelled"
        )}>
          {msg.text}
        </p>
      )}
    </div>
  );
}

// ─── Main ──────────────────────────────────────────────────────────────────────

function StoresContent() {
  const searchParams = useSearchParams();
  const { canAccessStore } = useAuth();
  const { stores, refresh } = useStores();
  const [selectedStoreIds, setSelectedStoreIds] = useState<string[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [banner, setBanner] = useState<{ ok: boolean; text: string } | null>(null);

  const accessibleStores = stores.filter((s) => canAccessStore(s.id));

  useEffect(() => {
    if (stores.length > 0 && selectedStoreIds.length === 0) {
      setSelectedStoreIds(stores.map((s) => s.id));
    }
  }, [stores]);

  useEffect(() => {
    const c = searchParams.get("converty");
    if (c === "connected") setBanner({ ok: true, text: "Converty connecté avec succès" });
    if (c === "error") setBanner({ ok: false, text: "Échec de la connexion Converty" });

    const s = searchParams.get("shopify");
    if (s === "connected") setBanner({ ok: true, text: "Shopify connecté avec succès" });
    if (s === "error") {
      const reason = searchParams.get("reason");
      setBanner({ ok: false, text: reason ? `Échec Shopify : ${decodeURIComponent(reason)}` : "Échec de la connexion Shopify" });
    }
  }, [searchParams]);

  return (
    <div className="flex h-screen bg-background">
      <Sidebar
        stores={accessibleStores}
        selectedStoreIds={selectedStoreIds}
        onChangeSelectedStores={setSelectedStoreIds}
      />

      <div className="flex min-w-0 max-w-full flex-1 flex-col overflow-x-hidden pt-14 md:pt-0">
        <header className="flex min-h-14 w-full max-w-full shrink-0 flex-wrap items-center justify-between gap-2 overflow-hidden border-b border-border bg-surface px-3 py-2 md:h-14 md:flex-nowrap md:px-5 md:py-0">
          <h1 className="text-base font-semibold">Magasins</h1>
          <Button size="sm" onClick={() => setShowAdd(true)}>
            <Plus className="h-3.5 w-3.5" />
            Ajouter un magasin
          </Button>
        </header>

        {banner && (
          <div className={cn(
            "flex items-center justify-between border-b px-5 py-3",
            banner.ok
              ? "border-status-delivered/30 bg-status-delivered-bg"
              : "border-status-cancelled/30 bg-status-cancelled-bg"
          )}>
            <p className={cn("text-sm font-medium", banner.ok ? "text-status-delivered" : "text-status-cancelled")}>
              {banner.text}
            </p>
            <button onClick={() => setBanner(null)} className="text-muted hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-5">
          {accessibleStores.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24">
              <StoreIcon className="h-8 w-8 text-muted-light" />
              <p className="mt-2 text-sm font-medium">Aucun magasin</p>
              <p className="mt-1 text-xs text-muted">Ajoutez votre première boutique.</p>
              <Button size="sm" className="mt-4" onClick={() => setShowAdd(true)}>
                <Plus className="h-3.5 w-3.5" />
                Ajouter un magasin
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              {accessibleStores.map((s) => (
                <StoreCard
                  key={s.id}
                  store={s as StoreRow}
                  onDeleted={refresh}
                  onRefresh={refresh}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {showAdd && (
        <AddStoreModal
          onClose={() => setShowAdd(false)}
          onCreated={refresh}
        />
      )}
    </div>
  );
}

export default function StoresPage() {
  return (
    <RouteGuard>
      <Suspense fallback={<div className="flex h-screen items-center justify-center"><p className="text-sm text-muted">Chargement...</p></div>}>
        <StoresContent />
      </Suspense>
    </RouteGuard>
  );
}