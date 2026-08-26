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
  MessageSquare, Search, Sparkles, ShoppingBag, X,
  Send, Check, Ban, RefreshCw, Phone, MapPin, User,
  ExternalLink, BarChart3, AlertTriangle,
} from "lucide-react";
import { ConvertCommentModal } from "@/components/social/convert-comment-modal";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api";

function getToken() {
  return window.localStorage.getItem("orderly_token");
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "a l'instant";
  if (mins < 60) return `il y a ${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `il y a ${hrs}h`;
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

function PlatformBadge({ platform }: { platform: string }) {
  const isIg = platform === "INSTAGRAM";
  return (
    <span
      className={cn(
        "flex h-4 w-4 shrink-0 items-center justify-center rounded text-[9px] font-bold text-white",
        isIg ? "bg-gradient-to-br from-purple-500 to-pink-500" : "bg-blue-600"
      )}
    >
      {isIg ? "I" : "f"}
    </span>
  );
}

const STATUS_STYLE: Record<string, string> = {
  NEW: "bg-primary-soft text-primary",
  REVIEWED: "bg-status-processing-bg text-status-processing",
  CONVERTED: "bg-status-delivered-bg text-status-delivered",
  IGNORED: "bg-surface-sunken text-muted",
};

const STATUS_LABEL: Record<string, string> = {
  NEW: "Nouveau",
  REVIEWED: "Vu",
  CONVERTED: "Converti",
  IGNORED: "Ignore",
};

function CommentsContent() {
  const searchParams = useSearchParams();
  const { canAccessStore } = useAuth();
  const { stores } = useStores();

  const [selectedStoreIds, setSelectedStoreIds] = useState<string[]>([]);
  const [tab, setTab] = useState<"comments" | "posts">("comments");
  const [accounts, setAccounts] = useState<any[]>([]);
  const [comments, setComments] = useState<any[]>([]);
  const [posts, setPosts] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [configured, setConfigured] = useState(true);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("NEW");
  const [search, setSearch] = useState("");
  const [onlyDetected, setOnlyDetected] = useState(false);
  const [convertTarget, setConvertTarget] = useState<any>(null);
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [busy, setBusy] = useState("");
  const [banner, setBanner] = useState<{ ok: boolean; text: string } | null>(null);

  const accessibleStores = stores.filter((s) => canAccessStore(s.id));

  useEffect(() => {
    if (stores.length > 0 && selectedStoreIds.length === 0) {
      setSelectedStoreIds(stores.map((s) => s.id));
    }
  }, [stores]);

  useEffect(() => {
    const m = searchParams.get("meta");
    if (m === "connected") {
      const saved = searchParams.get("saved");
      setBanner({ ok: true, text: `Meta connecte — ${saved ?? 0} comptes lies` });
    }
    if (m === "error") {
      const reason = searchParams.get("reason");
      setBanner({
        ok: false,
        text: reason ? `Echec Meta : ${decodeURIComponent(reason)}` : "Echec de la connexion Meta",
      });
    }
  }, [searchParams]);

  const fetchAll = useCallback(async () => {
    if (selectedStoreIds.length === 0) return;
    setLoading(true);
    const h = { Authorization: `Bearer ${getToken()}` };
    const q = `storeIds=${selectedStoreIds.join(",")}`;

    try {
      const [cfgRes, accRes, sumRes] = await Promise.all([
        fetch(`${API}/social/config`, { headers: h }),
        fetch(`${API}/social/accounts?${q}`, { headers: h }),
        fetch(`${API}/social/comments/summary?${q}`, { headers: h }),
      ]);
      const cfg = await cfgRes.json();
      setConfigured(cfg?.configured ?? false);
      setAccounts(await accRes.json());
      setSummary(await sumRes.json());

      if (tab === "comments") {
        const params = new URLSearchParams({ storeIds: selectedStoreIds.join(",") });
        if (filter !== "all") params.set("status", filter);
        if (search) params.set("search", search);
        if (onlyDetected) params.set("onlyDetected", "true");
        const res = await fetch(`${API}/social/comments?${params}`, { headers: h });
        setComments(await res.json());
      } else {
        const res = await fetch(`${API}/social/posts?${q}`, { headers: h });
        setPosts(await res.json());
      }
    } catch {
      setComments([]);
    } finally {
      setLoading(false);
    }
  }, [selectedStoreIds, tab, filter, search, onlyDetected]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  async function connect() {
    const storeId = selectedStoreIds[0];
    if (!storeId) return;
    setBusy("connect");
    try {
      const res = await fetch(`${API}/social/auth-url/${storeId}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const data = await res.json();
      if (!data.ok) {
        setBanner({ ok: false, text: data.error ?? "Erreur" });
        return;
      }
      window.location.href = data.url;
    } finally {
      setBusy("");
    }
  }

  async function syncAccount(id: string) {
    setBusy(id);
    try {
      const res = await fetch(`${API}/social/accounts/${id}/sync`, {
        method: "POST",
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const data = await res.json();
      setBanner(
        data.ok
          ? { ok: true, text: `${data.imported} nouveaux commentaires importes` }
          : { ok: false, text: data.error ?? "Echec" }
      );
      fetchAll();
    } finally {
      setBusy("");
    }
  }

  async function setStatus(id: string, status: string) {
    await fetch(`${API}/social/comments/${id}/status`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${getToken()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ status }),
    });
    setComments((prev) => prev.map((c) => (c.id === id ? { ...c, status } : c)));
    fetchAll();
  }

  async function sendReply(id: string) {
    if (!replyText.trim()) return;
    setBusy(id);
    try {
      const res = await fetch(`${API}/social/comments/${id}/reply`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${getToken()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ text: replyText }),
      });
      const data = await res.json();
      if (data.ok) {
        setReplyTo(null);
        setReplyText("");
        fetchAll();
      } else {
        setBanner({ ok: false, text: data.error ?? "Echec de la reponse" });
      }
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="flex h-screen bg-background">
      <Sidebar
        stores={accessibleStores}
        selectedStoreIds={selectedStoreIds}
        onChangeSelectedStores={setSelectedStoreIds}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-surface px-5">
          <h1 className="text-base font-semibold">Commentaires</h1>
          <Button size="sm" disabled={busy === "connect" || !configured} onClick={connect}>
            <ExternalLink className="h-3.5 w-3.5" />
            {busy === "connect" ? "Redirection..." : "Connecter une page"}
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

        {!configured && (
          <div className="flex items-start gap-2.5 border-b border-status-processing/30 bg-status-processing-bg px-5 py-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-status-processing" />
            <div className="text-xs text-status-processing">
              <p className="font-semibold">Application Meta non configuree</p>
              <p className="mt-0.5">
                Ajoutez META_APP_ID, META_APP_SECRET et META_REDIRECT_URI dans les
                variables du serveur pour activer la connexion Facebook et Instagram.
              </p>
            </div>
          </div>
        )}

        {/* Accounts */}
        {accounts.length > 0 && (
          <div className="flex gap-2 overflow-x-auto border-b border-border bg-surface px-5 py-3">
            {accounts.map((a) => (
              <div
                key={a.id}
                className="flex shrink-0 items-center gap-2 rounded-lg border border-border px-3 py-2"
              >
                {a.pictureUrl ? (
                  <img src={a.pictureUrl} alt="" className="h-7 w-7 rounded-full object-cover" />
                ) : (
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-surface-sunken">
                    <PlatformBadge platform={a.platform} />
                  </div>
                )}
                <div>
                  <p className="flex items-center gap-1.5 text-xs font-medium">
                    <PlatformBadge platform={a.platform} />
                    {a.name}
                  </p>
                  <p className="text-[10px] text-muted">
                    {a.commentCount} commentaires · {a.newCount} nouveaux
                  </p>
                </div>
                <button
                  onClick={() => syncAccount(a.id)}
                  disabled={busy === a.id}
                  className="ml-1 rounded p-1 text-muted hover:bg-surface-sunken hover:text-foreground"
                  title="Synchroniser"
                >
                  <RefreshCw className={cn("h-3.5 w-3.5", busy === a.id && "animate-spin")} />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Summary */}
        {summary && (
          <div className="grid grid-cols-5 gap-3 border-b border-border bg-surface p-4">
            <div className="rounded-lg bg-surface-sunken px-3 py-2.5">
              <p className="text-[10px] text-muted">Total</p>
              <p className="mt-0.5 text-xl font-bold">{summary.total}</p>
            </div>
            <div className="rounded-lg bg-primary-soft px-3 py-2.5">
              <p className="text-[10px] text-primary">Nouveaux</p>
              <p className="mt-0.5 text-xl font-bold text-primary">{summary.new}</p>
            </div>
            <div className="rounded-lg bg-status-processing-bg px-3 py-2.5">
              <p className="text-[10px] text-status-processing">Detectes</p>
              <p className="mt-0.5 text-xl font-bold text-status-processing">{summary.detected}</p>
            </div>
            <div className="rounded-lg bg-status-delivered-bg px-3 py-2.5">
              <p className="text-[10px] text-status-delivered">Convertis</p>
              <p className="mt-0.5 text-xl font-bold text-status-delivered">{summary.converted}</p>
            </div>
            <div className="rounded-lg bg-purple-50 px-3 py-2.5">
              <p className="text-[10px] text-purple-600">Taux conversion</p>
              <p className="mt-0.5 text-xl font-bold text-purple-600">{summary.conversionRate}%</p>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 border-b border-border bg-surface px-5 py-2">
          <button
            onClick={() => setTab("comments")}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
              tab === "comments" ? "bg-primary-soft text-primary" : "text-muted hover:bg-surface-sunken"
            )}
          >
            <MessageSquare className="h-3.5 w-3.5" />
            Commentaires
          </button>
          <button
            onClick={() => setTab("posts")}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
              tab === "posts" ? "bg-primary-soft text-primary" : "text-muted hover:bg-surface-sunken"
            )}
          >
            <BarChart3 className="h-3.5 w-3.5" />
            Par publication
          </button>
        </div>

        {tab === "comments" && (
          <div className="flex items-center gap-3 border-b border-border bg-surface px-5 py-3">
            <div className="relative w-64">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-light" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Rechercher..."
                className="pl-8"
              />
            </div>
            <div className="flex gap-1">
              {[
                { key: "NEW", label: "Nouveaux" },
                { key: "REVIEWED", label: "Vus" },
                { key: "CONVERTED", label: "Convertis" },
                { key: "IGNORED", label: "Ignores" },
                { key: "all", label: "Tous" },
              ].map((t) => (
                <button
                  key={t.key}
                  onClick={() => setFilter(t.key)}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                    filter === t.key ? "bg-primary-soft text-primary" : "text-muted hover:bg-surface-sunken"
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <label className="ml-auto flex cursor-pointer items-center gap-2 text-xs text-muted">
              <input
                type="checkbox"
                checked={onlyDetected}
                onChange={(e) => setOnlyDetected(e.target.checked)}
                className="h-3.5 w-3.5 accent-primary"
              />
              Commandes detectees seulement
            </label>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-5">
          {loading ? (
            <p className="py-16 text-center text-sm text-muted">Chargement...</p>
          ) : tab === "posts" ? (
            posts.length === 0 ? (
              <p className="py-16 text-center text-sm text-muted">Aucune publication</p>
            ) : (
              <div className="space-y-2">
                {posts.map((p) => (
                  <div key={p.postId} className="flex items-center gap-4 rounded-xl border border-border bg-surface p-4">
                    {p.picture ? (
                      <img src={p.picture} alt="" className="h-14 w-14 shrink-0 rounded-lg object-cover" />
                    ) : (
                      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-surface-sunken">
                        <MessageSquare className="h-5 w-5 text-muted-light" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <PlatformBadge platform={p.platform} />
                        <span className="text-xs font-medium">{p.accountName}</span>
                        {p.type === "AD" && (
                          <span className="rounded bg-purple-50 px-1.5 py-0.5 text-[10px] font-medium text-purple-600">
                            Publicite
                          </span>
                        )}
                      </div>
                      <p className="mt-1 truncate text-sm">{p.message ?? "Publication"}</p>
                    </div>
                    <div className="flex shrink-0 gap-4 text-center">
                      <div>
                        <p className="text-lg font-bold">{p.comments}</p>
                        <p className="text-[10px] text-muted">commentaires</p>
                      </div>
                      <div>
                        <p className="text-lg font-bold text-status-processing">{p.detected}</p>
                        <p className="text-[10px] text-muted">detectes</p>
                      </div>
                      <div>
                        <p className="text-lg font-bold text-status-delivered">{p.converted}</p>
                        <p className="text-[10px] text-muted">commandes</p>
                      </div>
                      <div>
                        <p className="font-mono text-lg font-bold text-primary">
                          {Math.round(p.revenue ?? 0)}
                        </p>
                        <p className="text-[10px] text-muted">TND</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )
          ) : comments.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24">
              <MessageSquare className="h-8 w-8 text-muted-light" />
              <p className="mt-2 text-sm font-medium">Aucun commentaire</p>
              <p className="mt-1 text-center text-xs text-muted">
                {accounts.length === 0
                  ? "Connectez une page Facebook ou un compte Instagram pour commencer."
                  : "Synchronisez un compte pour recuperer les commentaires."}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {comments.map((c) => (
                <div
                  key={c.id}
                  className={cn(
                    "rounded-xl border bg-surface p-4",
                    c.confidence >= 0.5 && c.status === "NEW"
                      ? "border-primary/40"
                      : "border-border"
                  )}
                >
                  <div className="flex items-start gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-sunken text-sm font-semibold">
                      {(c.authorName ?? "?")[0]?.toUpperCase()}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium">{c.authorName}</span>
                        <PlatformBadge platform={c.account?.platform} />
                        <span className="text-[11px] text-muted">{c.account?.name}</span>
                        <span className="text-[11px] text-muted-light">{timeAgo(c.postedAt)}</span>
                        <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-medium", STATUS_STYLE[c.status])}>
                          {STATUS_LABEL[c.status]}
                        </span>
                        {c.confidence >= 0.5 && (
                          <span className="flex items-center gap-1 rounded bg-primary-soft px-1.5 py-0.5 text-[10px] font-medium text-primary">
                            <Sparkles className="h-2.5 w-2.5" />
                            commande detectee
                          </span>
                        )}
                      </div>

                      <p className="mt-1.5 text-sm">{c.message}</p>

                      {(c.detectedPhone || c.detectedName || c.detectedCity) && (
                        <div className="mt-2 flex flex-wrap gap-3 rounded-lg bg-surface-sunken px-3 py-2 text-[11px]">
                          {c.detectedName && (
                            <span className="flex items-center gap-1 text-muted">
                              <User className="h-3 w-3" />
                              {c.detectedName}
                            </span>
                          )}
                          {c.detectedPhone && (
                            <span className="flex items-center gap-1 font-mono text-muted">
                              <Phone className="h-3 w-3" />
                              {c.detectedPhone}
                            </span>
                          )}
                          {c.detectedCity && (
                            <span className="flex items-center gap-1 text-muted">
                              <MapPin className="h-3 w-3" />
                              {c.detectedCity}
                            </span>
                          )}
                        </div>
                      )}

                      {c.order && (
                        <div className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-status-delivered-bg px-2 py-1 text-[11px] font-medium text-status-delivered">
                          <ShoppingBag className="h-3 w-3" />
                          {c.order.orderNumber} · {Number(c.order.total)} TND
                        </div>
                      )}

                      {c.replyText && (
                        <p className="mt-2 rounded-lg border-l-2 border-primary bg-primary-soft/30 px-3 py-1.5 text-[11px] text-muted">
                          Votre reponse : {c.replyText}
                        </p>
                      )}

                      {replyTo === c.id ? (
                        <div className="mt-2 flex gap-2">
                          <Input
                            value={replyText}
                            onChange={(e) => setReplyText(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && sendReply(c.id)}
                            placeholder="Votre reponse..."
                            className="h-8 flex-1 text-xs"
                            autoFocus
                          />
                          <Button size="sm" disabled={busy === c.id} onClick={() => sendReply(c.id)}>
                            <Send className="h-3 w-3" />
                          </Button>
                          <Button size="sm" variant="secondary" onClick={() => setReplyTo(null)}>
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      ) : (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {c.status !== "CONVERTED" && (
                            <Button size="sm" onClick={() => setConvertTarget(c)}>
                              <ShoppingBag className="h-3 w-3" />
                              Creer commande
                            </Button>
                          )}
                          <Button size="sm" variant="secondary" onClick={() => setReplyTo(c.id)}>
                            <Send className="h-3 w-3" />
                            Repondre
                          </Button>
                          {c.status === "NEW" && (
                            <Button size="sm" variant="ghost" onClick={() => setStatus(c.id, "REVIEWED")}>
                              <Check className="h-3 w-3" />
                              Marquer vu
                            </Button>
                          )}
                          {c.status !== "IGNORED" && c.status !== "CONVERTED" && (
                            <Button size="sm" variant="ghost" onClick={() => setStatus(c.id, "IGNORED")}>
                              <Ban className="h-3 w-3" />
                              Ignorer
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {convertTarget && (
        <ConvertCommentModal
          comment={convertTarget}
          onClose={() => setConvertTarget(null)}
          onConverted={() => {
            setBanner({ ok: true, text: "Commande creee avec succes" });
            fetchAll();
          }}
        />
      )}
    </div>
  );
}

export default function CommentsPage() {
  return (
    <RouteGuard>
      <Suspense
        fallback={
          <div className="flex h-screen items-center justify-center">
            <p className="text-sm text-muted">Chargement...</p>
          </div>
        }
      >
        <CommentsContent />
      </Suspense>
    </RouteGuard>
  );
}