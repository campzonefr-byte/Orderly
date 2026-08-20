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
  XCircle, Trash2, ArrowLeft, ExternalLink, Eye, EyeOff,
  RefreshCw, Download, Store as StoreIcon,
} from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api";

function getToken() {
  return window.localStorage.getItem("orderly_token");
}

type SourceType = "SHOPIFY" | "CONVERTY" | "CUSTOM";

interface StoreRow {
  id: string;
  name: string;
  sourceType: string;
  isActive: boolean;
  orderCount?: number;
  createdAt?: string;
}

const SOURCES: {
  key: SourceType;
  label: string;
  desc: string;
  icon: any;
  tone: string;
}[] = [
  {
    key: "SHOPIFY",
    label: "Shopify",
    desc: "Recuperer les commandes depuis votre boutique Shopify",
    icon: ShoppingBag,
    tone: "bg-status-delivered-bg text-status-delivered",
  },
  {
    key: "CONVERTY",
    label: "Converty",
    desc: "Connexion en un clic via OAuth",
    icon: Globe,
    tone: "bg-primary-soft text-primary",
  },
  {
    key: "CUSTOM",
    label: "Manuel",
    desc: "Magasin sans source externe, commandes creees a la main",
    icon: Settings2,
    tone: "bg-surface-sunken text-muted",
  },
];

function AddStoreModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [step, setStep] = useState<1 | 2>(1);
  const [source, setSource] = useState<SourceType | null>(null);
  const [name, setName] = useState("");
  const [domain, setDomain] = useState("");
  const [token, setToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function create() {
    if (!name.trim() || !source) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${API}/stores`, {
        method: "POST",
        headers: { Authorization: `Bearer ${getToken()}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          sourceType: source === "CONVERTY" ? "MARKETPLACE" : source,
        }),
      });
      const store = await res.json();
      if (!res.ok || !store?.id) throw new Error("Creation echouee");

      if (source === "SHOPIFY" && token.trim() && domain.trim()) {
        await fetch(`${API}/stores/${store.id}/credentials`, {
          method: "PATCH",
          headers: { Authorization: `Bearer ${getToken()}`, "Content-Type": "application/json" },
          body: JSON.stringify({ shopDomain: domain.trim(), accessToken: token.trim() }),
        });
      }

      if (source === "CONVERTY") {
        const r = await fetch(`${API}/integrations/converty/${store.id}/auth-url`, {
          headers: { Authorization: `Bearer ${getToken()}` },
        });
        const data = await r.json();
        if (data?.url) {
          window.location.href = data.url;
          return;
        }
      }

      onCreated();
      onClose();
    } catch (e: any) {
      setError(e?.message ?? "Erreur");
    } finally {
      setLoading(false);
    }
  }

  const chosen = SOURCES.find((s) => s.key === source);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-foreground/30 backdrop-blur-[2px]">
      <div className="w-full max-w-lg rounded-xl border border-border bg-surface shadow-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="flex items-center gap-2">
            {step === 2 && (
              <button
                onClick={() => setStep(1)}
                className="rounded-md p-1 text-muted hover:bg-surface-sunken"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
            )}
            <div>
              <h2 className="text-sm font-semibold">
                {step === 1 ? "Ajouter un magasin" : `Configurer ${chosen?.label}`}
              </h2>
              <p className="text-xs text-muted">
                {step === 1 ? "Etape 1 sur 2 — choisir la source" : "Etape 2 sur 2"}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-md p-1 hover:bg-surface-sunken">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {step === 1 ? (
            SOURCES.map((s) => {
              const Icon = s.icon;
              return (
                <button
                  key={s.key}
                  onClick={() => {
                    setSource(s.key);
                    setStep(2);
                  }}
                  className="flex w-full items-center gap-3 rounded-xl border-2 border-border p-4 text-left transition-colors hover:border-primary"
                >
                  <div className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-lg", s.tone)}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">{s.label}</p>
                    <p className="text-[11px] text-muted">{s.desc}</p>
                  </div>
                </button>
              );
            })
          ) : (
            <>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted">Nom du magasin</label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="ex: Meday"
                  autoFocus
                />
              </div>

              {source === "SHOPIFY" && (
                <>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-muted">
                      Domaine de la boutique
                    </label>
                    <Input
                      value={domain}
                      onChange={(e) => setDomain(e.target.value)}
                      placeholder="votre-boutique.myshopify.com"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-muted">
                      Access token
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

                  <div className="rounded-lg bg-surface-sunken px-3 py-2.5 text-[11px] text-muted space-y-1">
                    <p className="font-medium text-foreground">Ou trouver le token</p>
                    <p>1. Shopify Admin → Settings → Apps and sales channels</p>
                    <p>2. Develop apps → Create an app → nommer "Orderly"</p>
                    <p>3. Configure Admin API scopes → cocher read_products, read_orders, write_orders, read_inventory</p>
                    <p>4. Save → Install app → Reveal token once</p>
                    <p className="text-status-processing">Le token n'est visible qu'une seule fois.</p>
                  </div>
                </>
              )}

              {source === "CONVERTY" && (
                <div className="rounded-lg bg-primary-soft px-3 py-3 text-[11px] text-primary space-y-1">
                  <p className="font-semibold">Connexion en un clic</p>
                  <p>
                    Apres avoir cree le magasin, vous serez redirige vers Converty pour
                    autoriser Orderly. Les commandes et produits seront ensuite importables.
                  </p>
                  <p className="mt-1">Les webhooks seront enregistres automatiquement.</p>
                </div>
              )}

              {source === "CUSTOM" && (
                <div className="rounded-lg bg-surface-sunken px-3 py-2.5 text-[11px] text-muted">
                  <p>
                    Aucune source externe. Les commandes seront creees manuellement
                    depuis Confirmation, Preparation ou la Messagerie.
                  </p>
                </div>
              )}

              {error && (
                <p className="rounded-md bg-status-cancelled-bg px-3 py-2 text-xs font-medium text-status-cancelled">
                  {error}
                </p>
              )}
            </>
          )}
        </div>

        {step === 2 && (
          <div className="flex gap-2 border-t border-border px-5 py-4">
            <Button variant="secondary" className="flex-1" onClick={() => setStep(1)}>
              Retour
            </Button>
            <Button className="flex-1" disabled={loading || !name.trim()} onClick={create}>
              {loading
                ? "Creation..."
                : source === "CONVERTY"
                ? "Creer et connecter"
                : "Creer le magasin"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function StoreCard({
  store,
  onDeleted,
}: {
  store: StoreRow;
  onDeleted: () => void;
}) {
  const [convertyStatus, setConvertyStatus] = useState<any>(null);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [shopifyStatus, setShopifyStatus] = useState<any>(null);
  const [shopDomain, setShopDomain] = useState("");
  const isConverty = store.sourceType === "MARKETPLACE";
  const isShopify = store.sourceType === "SHOPIFY";

  const fetchConverty = useCallback(async () => {
    if (!isConverty) return;
    try {
      const res = await fetch(`${API}/integrations/converty/${store.id}/status`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      setConvertyStatus(await res.json());
    } catch {}
  }, [store.id, isConverty]);

  const fetchShopify = useCallback(async () => {
    if (!isShopify) return;
    try {
      const res = await fetch(`${API}/integrations/shopify/${store.id}/status`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const data = await res.json();
      setShopifyStatus(data);
      if (data?.domain) setShopDomain(data.domain);
    } catch {}
  }, [store.id, isShopify]);

  useEffect(() => {
    fetchConverty();
    fetchShopify();
  }, [fetchConverty, fetchShopify]);

  async function connectShopify() {
    if (!shopDomain.trim()) {
      setMsg({ ok: false, text: "Saisissez le domaine .myshopify.com" });
      return;
    }
    setBusy("shopify-connect");
    try {
      const res = await fetch(`${API}/integrations/shopify/${store.id}/auth-url`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${getToken()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ shopDomain: shopDomain.trim() }),
      });
      const data = await res.json();
      if (!data.ok) {
        setMsg({ ok: false, text: data.error ?? "Erreur" });
        return;
      }
      window.location.href = data.url;
    } finally {
      setBusy("");
    }
  }

  async function runShopify(action: string, label: string) {
    setBusy(action);
    setMsg(null);
    try {
      const res = await fetch(`${API}/integrations/shopify/${store.id}/${action}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${getToken()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (data.ok) {
        setMsg({
          ok: true,
          text:
            action === "test"
              ? `Connecte a ${data.shop ?? "la boutique"}`
              : action === "register-webhooks"
              ? "Webhooks enregistres"
              : `${label} : ${data.created ?? 0} crees, ${data.updated ?? 0} mis a jour`,
        });
      } else {
        setMsg({ ok: false, text: data.error ?? "Echec" });
      }
      fetchShopify();
    } catch {
      setMsg({ ok: false, text: "Erreur reseau" });
    } finally {
      setBusy("");
    }
  }

  async function connectConverty() {
    setBusy("connect");
    try {
      const res = await fetch(`${API}/integrations/converty/${store.id}/auth-url`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const data = await res.json();
      if (data?.url) window.location.href = data.url;
    } finally {
      setBusy("");
    }
  }

  async function run(action: string, label: string) {
    setBusy(action);
    setMsg(null);
    try {
      const res = await fetch(`${API}/integrations/converty/${store.id}/${action}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${getToken()}`, "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (data.ok) {
        const detail =
          action === "import-products"
            ? `${data.created} crees, ${data.updated} mis a jour`
            : action === "import-orders"
            ? `${data.created} importees, ${data.skipped} deja presentes`
            : "Termine";
        setMsg({ ok: true, text: `${label} : ${detail}` });
      } else {
        setMsg({ ok: false, text: data.error ?? "Echec" });
      }
      fetchConverty();
    } catch {
      setMsg({ ok: false, text: "Erreur reseau" });
    } finally {
      setBusy("");
    }
  }

  async function remove() {
    if (!window.confirm(`Supprimer le magasin ${store.name} ?`)) return;
    await fetch(`${API}/stores/${store.id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    onDeleted();
  }

  const Icon = isShopify ? ShoppingBag : isConverty ? Globe : Settings2;
  const tone = isShopify
    ? "bg-status-delivered-bg text-status-delivered"
    : isConverty
    ? "bg-primary-soft text-primary"
    : "bg-surface-sunken text-muted";

  return (
    <div className="rounded-xl border border-border bg-surface p-5">
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
        <button
          onClick={remove}
          className="rounded-md p-1.5 text-muted hover:bg-status-cancelled-bg hover:text-status-cancelled"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {isConverty && (
        <div className="mt-4 space-y-3">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "flex items-center gap-1.5 rounded px-2 py-1 text-xs font-medium",
                convertyStatus?.connected
                  ? "bg-status-delivered-bg text-status-delivered"
                  : "bg-status-onhold-bg text-muted"
              )}
            >
              {convertyStatus?.connected ? (
                <CheckCircle2 className="h-3 w-3" />
              ) : (
                <XCircle className="h-3 w-3" />
              )}
              {convertyStatus?.connected ? "Connecte" : "Non connecte"}
            </span>
          </div>

          {convertyStatus?.connected ? (
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="secondary"
                disabled={busy !== ""}
                onClick={() => run("import-products", "Produits")}
              >
                <Download className="h-3.5 w-3.5" />
                {busy === "import-products" ? "Import..." : "Importer produits"}
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={busy !== ""}
                onClick={() => run("import-orders", "Commandes")}
              >
                <Download className="h-3.5 w-3.5" />
                {busy === "import-orders" ? "Import..." : "Importer commandes"}
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={busy !== ""}
                onClick={() => run("register-webhooks", "Webhooks")}
              >
                <RefreshCw className={cn("h-3.5 w-3.5", busy === "register-webhooks" && "animate-spin")} />
                Webhooks
              </Button>
            </div>
          ) : (
            <Button size="sm" disabled={busy !== ""} onClick={connectConverty}>
              <ExternalLink className="h-3.5 w-3.5" />
              {busy === "connect" ? "Redirection..." : "Connecter Converty"}
            </Button>
          )}

          {msg && (
            <p
              className={cn(
                "rounded-md px-3 py-2 text-xs font-medium",
                msg.ok
                  ? "bg-status-delivered-bg text-status-delivered"
                  : "bg-status-cancelled-bg text-status-cancelled"
              )}
            >
              {msg.text}
            </p>
          )}
        </div>
      )}

{isShopify && (
        <div className="mt-4 space-y-3">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "flex items-center gap-1.5 rounded px-2 py-1 text-xs font-medium",
                shopifyStatus?.connected
                  ? "bg-status-delivered-bg text-status-delivered"
                  : "bg-status-onhold-bg text-muted"
              )}
            >
                        {shopifyStatus?.needsReconnect && (
            <div className="rounded-lg bg-status-processing-bg px-3 py-2 text-[11px] text-status-processing">
              Ancien token detecte. Reconnectez la boutique pour activer l'import
              des produits et la gestion des webhooks.
            </div>
          )}

          {shopifyStatus?.connected ? (
                <CheckCircle2 className="h-3 w-3" />
              ) : (
                <XCircle className="h-3 w-3" />
              )}
              {shopifyStatus?.connected ? "Connecte" : "Non connecte"}
            </span>
            {shopifyStatus?.domain && (
              <span className="font-mono text-[11px] text-muted">
                {shopifyStatus.domain}
              </span>
            )}
          </div>

          {shopifyStatus?.connected ? (
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="secondary"
                disabled={busy !== ""}
                onClick={() => runShopify("test", "Test")}
              >
                <RefreshCw className={cn("h-3.5 w-3.5", busy === "test" && "animate-spin")} />
                Tester
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={busy !== ""}
                onClick={() => runShopify("import-all-products", "Produits")}
              >
                <Download className="h-3.5 w-3.5" />
                {busy === "import-all-products" ? "Import..." : "Importer produits"}
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={busy !== ""}
                onClick={() => runShopify("register-webhooks", "Webhooks")}
              >
                <RefreshCw className={cn("h-3.5 w-3.5", busy === "register-webhooks" && "animate-spin")} />
                Webhooks
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              <Input
                value={shopDomain}
                onChange={(e) => setShopDomain(e.target.value)}
                placeholder="votre-boutique.myshopify.com"
                className="h-8 text-xs"
              />
              <Button
                size="sm"
                className="w-full"
                disabled={busy !== "" || !shopDomain.trim()}
                onClick={connectShopify}
              >
                <ExternalLink className="h-3.5 w-3.5" />
                {busy === "shopify-connect" ? "Redirection..." : "Connecter Shopify"}
              </Button>
            </div>
          )}

          {msg && (
            <p
              className={cn(
                "rounded-md px-3 py-2 text-xs font-medium",
                msg.ok
                  ? "bg-status-delivered-bg text-status-delivered"
                  : "bg-status-cancelled-bg text-status-cancelled"
              )}
            >
              {msg.text}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

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
    if (c === "connected") setBanner({ ok: true, text: "Converty connecte avec succes" });
    if (c === "error") setBanner({ ok: false, text: "Echec de la connexion Converty" });

    const s = searchParams.get("shopify");
    if (s === "connected") setBanner({ ok: true, text: "Shopify connecte avec succes" });
    if (s === "error") {
      const reason = searchParams.get("reason");
      setBanner({
        ok: false,
        text: reason
          ? `Echec Shopify : ${decodeURIComponent(reason)}`
          : "Echec de la connexion Shopify",
      });
    }
  }, [searchParams]);

  return (
    <div className="flex h-screen bg-background">
      <Sidebar
        stores={accessibleStores}
        selectedStoreIds={selectedStoreIds}
        onChangeSelectedStores={setSelectedStoreIds}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-surface px-5">
          <h1 className="text-base font-semibold">Magasins</h1>
          <Button size="sm" onClick={() => setShowAdd(true)}>
            <Plus className="h-3.5 w-3.5" />
            Ajouter un magasin
          </Button>
        </header>

        {banner && (
          <div
            className={cn(
              "flex items-center justify-between border-b px-5 py-3",
              banner.ok
                ? "border-status-delivered/30 bg-status-delivered-bg"
                : "border-status-cancelled/30 bg-status-cancelled-bg"
            )}
          >
            <p
              className={cn(
                "text-sm font-medium",
                banner.ok ? "text-status-delivered" : "text-status-cancelled"
              )}
            >
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
              <p className="mt-1 text-xs text-muted">
                Ajoutez votre premiere boutique Shopify ou Converty.
              </p>
              <Button size="sm" className="mt-4" onClick={() => setShowAdd(true)}>
                <Plus className="h-3.5 w-3.5" />
                Ajouter un magasin
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              {accessibleStores.map((s) => (
                <StoreCard key={s.id} store={s as StoreRow} onDeleted={refresh} />
              ))}
            </div>
          )}
        </div>
      </div>

      {showAdd && (
        <AddStoreModal onClose={() => setShowAdd(false)} onCreated={refresh} />
      )}
    </div>
  );
}

export default function StoresPage() {
  return (
    <RouteGuard>
      <Suspense
        fallback={
          <div className="flex h-screen items-center justify-center">
            <p className="text-sm text-muted">Chargement...</p>
          </div>
        }
      >
        <StoresContent />
      </Suspense>
    </RouteGuard>
  );
}