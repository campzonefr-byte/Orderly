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
  Plus, X, Check, Shield, Users, Mail,
  ToggleLeft, ToggleRight, Trash2, Copy, ExternalLink,
} from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api";

function getToken() {
  return window.localStorage.getItem("orderly_token");
}

interface User {
  id: string;
  email: string;
  name: string;
  role: "SUPER_ADMIN" | "STORE_MANAGER" | "STAFF";
  permissions: string[];
  isActive: boolean;
  createdAt: string;
  storeAccess: { storeId: string }[];
}

const ALL_PERMISSIONS = [
  { key: "confirmation", label: "Confirmation", description: "Appels de confirmation, tentatives" },
  { key: "preparation", label: "Préparation", description: "Préparer les commandes, bordereaux" },
  { key: "fulfillment", label: "Livraison", description: "Suivi des livraisons, statuts" },
  { key: "retours", label: "Retours", description: "Gestion des retours" },
  { key: "reclamation", label: "Réclamations", description: "Traitement des réclamations" },
  { key: "products", label: "Produits & Stock", description: "Gestion des produits et stocks" },
  { key: "stats", label: "Statistiques", description: "Voir les chiffres, KPIs et chiffre d'affaires" },
  { key: "alerts", label: "Alertes stock", description: "Voir les alertes de stock" },
  { key: "inbox", label: "Messagerie", description: "Répondre aux messages clients" },
  { key: "scanner", label: "Scanner QR", description: "Scanner les codes QR" },
  { key: "stores", label: "Magasins", description: "Gérer les magasins" },
  { key: "users", label: "Utilisateurs", description: "Gérer les utilisateurs" },
  { key: "integrations", label: "Intégrations", description: "Gérer les intégrations" },
  { key: "settings", label: "Paramètres", description: "Paramètres du compte" },
  { key: "marketing", label: "Marketing", description: "Segments, campagnes SMS et automatisations" },
  { key: "clients", label: "Clients", description: "Voir la base clients et leurs statistiques" },
  { key: "comments", label: "Commentaires", description: "Commentaires Facebook et Instagram" },
  { key: "chat", label: "Chat équipe", description: "Messagerie interne entre agents" },
  { key: "agents", label: "Performance agents", description: "Voir les statistiques des agents" },{ key: "archives", label: "Archives", description: "Voir et restaurer les commandes archivées" },
];

const ROLE_LABELS = {
  SUPER_ADMIN: "Super Admin",
  STORE_MANAGER: "Manager",
  STAFF: "Staff",
};

const ROLE_COLORS = {
  SUPER_ADMIN: "bg-purple-100 text-purple-700",
  STORE_MANAGER: "bg-blue-100 text-blue-700",
  STAFF: "bg-gray-100 text-gray-600",
};

function InviteModal({
  stores,
  onClose,
  onInvited,
}: {
  stores: any[];
  onClose: () => void;
  onInvited: (inviteUrl: string, email: string) => void;
}) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<"SUPER_ADMIN" | "STORE_MANAGER" | "STAFF">("STAFF");
  const [permissions, setPermissions] = useState<string[]>([
    "confirmation", "preparation", "fulfillment", "retours",
  ]);
  const [selectedStores, setSelectedStores] = useState<string[]>(stores.map((s) => s.id));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function togglePermission(key: string) {
    setPermissions((prev) =>
      prev.includes(key) ? prev.filter((p) => p !== key) : [...prev, key]
    );
  }

  function toggleStore(id: string) {
    setSelectedStores((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
    );
  }

  function selectAllPermissions() {
    setPermissions(ALL_PERMISSIONS.map((p) => p.key));
  }

  function clearPermissions() {
    setPermissions([]);
  }

  async function handleInvite() {
    if (!email.trim() || !name.trim()) {
      setError("Email et nom requis.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${API}/users/invite`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${getToken()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: email.trim(),
          name: name.trim(),
          role,
          permissions,
          storeIds: selectedStores,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message ?? "Erreur");
      }
      const data = await res.json();
      onInvited(data.inviteUrl, email);
      onClose();
    } catch (e: any) {
      setError(e.message ?? "Erreur lors de l'invitation");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30 backdrop-blur-[2px]">
      <div className="w-full max-w-2xl rounded-xl border border-border bg-surface shadow-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <Mail className="h-4 w-4" />
            Inviter un utilisateur
          </h2>
          <button onClick={onClose} className="rounded-md p-1 hover:bg-surface-sunken">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Basic info */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">Nom complet</label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Yassine Amri" autoFocus />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">Email</label>
              <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="yassine@email.com" type="email" />
            </div>
          </div>

          {/* Role */}
          <div>
            <label className="mb-2 block text-xs font-medium text-muted">Rôle</label>
            <div className="flex gap-2">
              {(["SUPER_ADMIN", "STORE_MANAGER", "STAFF"] as const).map((r) => (
                <button
                  key={r}
                  onClick={() => setRole(r)}
                  className={cn(
                    "flex-1 rounded-lg border-2 py-2 text-xs font-medium transition-colors",
                    role === r
                      ? "border-primary bg-primary-soft text-primary"
                      : "border-border text-muted hover:border-border-strong"
                  )}
                >
                  {ROLE_LABELS[r]}
                </button>
              ))}
            </div>
          </div>

          {/* Permissions */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-muted">Permissions</label>
              <div className="flex gap-2">
                <button onClick={selectAllPermissions} className="text-xs text-primary hover:underline">Tout sélectionner</button>
                <span className="text-muted">·</span>
                <button onClick={clearPermissions} className="text-xs text-muted hover:underline">Effacer</button>
              </div>
            </div>
            <div className="rounded-lg border border-border divide-y divide-border">
              {ALL_PERMISSIONS.map((p) => (
                <div
                  key={p.key}
                  onClick={() => togglePermission(p.key)}
                  className="flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-surface-sunken transition-colors"
                >
                  <div className={cn(
                    "flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 transition-colors",
                    permissions.includes(p.key)
                      ? "border-primary bg-primary"
                      : "border-border"
                  )}>
                    {permissions.includes(p.key) && <Check className="h-3 w-3 text-white" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium">{p.label}</p>
                    <p className="text-[11px] text-muted">{p.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Stores */}
          {stores.length > 0 && (
            <div>
              <label className="mb-2 block text-xs font-medium text-muted">Accès aux magasins</label>
              <div className="flex flex-wrap gap-2">
                {stores.map((store) => (
                  <button
                    key={store.id}
                    onClick={() => toggleStore(store.id)}
                    className={cn(
                      "rounded-lg border-2 px-3 py-1.5 text-xs font-medium transition-colors",
                      selectedStores.includes(store.id)
                        ? "border-primary bg-primary-soft text-primary"
                        : "border-border text-muted hover:border-border-strong"
                    )}
                  >
                    {store.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {error && (
            <p className="rounded-md bg-status-cancelled-bg px-3 py-2 text-xs font-medium text-status-cancelled">
              {error}
            </p>
          )}
        </div>

        <div className="flex gap-2 border-t border-border px-5 py-4">
          <Button variant="secondary" className="flex-1" onClick={onClose}>Annuler</Button>
          <Button
            className="flex-1"
            disabled={loading || !email.trim() || !name.trim()}
            onClick={handleInvite}
          >
            <Mail className="h-3.5 w-3.5" />
            {loading ? "Envoi..." : "Envoyer l'invitation"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function PermissionsModal({
  user,
  onClose,
  onSaved,
}: {
  user: User;
  onClose: () => void;
  onSaved: (permissions: string[]) => void;
}) {
  const [permissions, setPermissions] = useState<string[]>(user.permissions ?? []);
  const [loading, setLoading] = useState(false);

  function togglePermission(key: string) {
    setPermissions((prev) =>
      prev.includes(key) ? prev.filter((p) => p !== key) : [...prev, key]
    );
  }

  async function save() {
    setLoading(true);
    try {
      await fetch(`${API}/users/${user.id}/permissions`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${getToken()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ permissions }),
      });
      onSaved(permissions);
      onClose();
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30 backdrop-blur-[2px]">
      <div className="w-full max-w-lg rounded-xl border border-border bg-surface shadow-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold">Permissions — {user.name}</h2>
            <p className="text-xs text-muted">{user.email}</p>
          </div>
          <button onClick={onClose} className="rounded-md p-1 hover:bg-surface-sunken">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="rounded-lg border border-border divide-y divide-border m-5">
            {ALL_PERMISSIONS.map((p) => (
              <div
                key={p.key}
                onClick={() => togglePermission(p.key)}
                className="flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-surface-sunken transition-colors"
              >
                <div className={cn(
                  "flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 transition-colors",
                  permissions.includes(p.key)
                    ? "border-primary bg-primary"
                    : "border-border"
                )}>
                  {permissions.includes(p.key) && <Check className="h-3 w-3 text-white" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium">{p.label}</p>
                  <p className="text-[11px] text-muted">{p.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex gap-2 border-t border-border px-5 py-4">
          <Button variant="secondary" className="flex-1" onClick={onClose}>Annuler</Button>
          <Button className="flex-1" disabled={loading} onClick={save}>
            <Check className="h-3.5 w-3.5" />
            {loading ? "Sauvegarde..." : "Sauvegarder"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function InviteLinkModal({
  inviteUrl,
  email,
  onClose,
}: {
  inviteUrl: string;
  email: string;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  function copy() {
    navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30 backdrop-blur-[2px]">
      <div className="w-full max-w-md rounded-xl border border-border bg-surface shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-sm font-semibold">Invitation envoyée</h2>
          <button onClick={onClose} className="rounded-md p-1 hover:bg-surface-sunken">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div className="rounded-lg bg-status-delivered-bg p-4 text-center">
            <Check className="mx-auto h-8 w-8 text-status-delivered mb-2" />
            <p className="text-sm font-medium text-status-delivered">Invitation créée!</p>
            <p className="text-xs text-muted mt-1">Partagez ce lien avec <strong>{email}</strong></p>
          </div>

          <div className="rounded-lg border border-border p-3">
            <p className="text-[11px] text-muted mb-2">Lien d'invitation (valide 7 jours)</p>
            <div className="flex items-center gap-2">
              <p className="flex-1 font-mono text-xs break-all text-muted bg-surface-sunken rounded p-2">
                {inviteUrl}
              </p>
            </div>
          </div>

          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={copy}>
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? "Copié!" : "Copier le lien"}
            </Button>
            <Button variant="secondary" className="flex-1" onClick={() => window.open(inviteUrl, "_blank")}>
              <ExternalLink className="h-3.5 w-3.5" />
              Ouvrir
            </Button>
          </div>
        </div>
        <div className="border-t border-border px-5 py-4">
          <Button className="w-full" onClick={onClose}>Fermer</Button>
        </div>
      </div>
    </div>
  );
}

function UsersContent() {
  const { user: currentUser, canAccessStore } = useAuth();
  const { stores } = useStores();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedStoreIds, setSelectedStoreIds] = useState<string[]>([]);
  const [showInvite, setShowInvite] = useState(false);
  const [permissionsUser, setPermissionsUser] = useState<User | null>(null);
  const [inviteResult, setInviteResult] = useState<{ url: string; email: string } | null>(null);

  const accessibleStores = stores.filter((s) => canAccessStore(s.id));

  useEffect(() => {
    if (stores.length > 0 && selectedStoreIds.length === 0) {
      setSelectedStoreIds(stores.map((s) => s.id));
    }
  }, [stores]);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/users`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const data = await res.json();
      setUsers(Array.isArray(data) ? data : []);
    } catch {
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  async function toggleActive(userId: string) {
    await fetch(`${API}/users/${userId}/toggle`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    fetchUsers();
  }

  async function removeUser(userId: string) {
    if (!window.confirm("Supprimer cet utilisateur?")) return;
    await fetch(`${API}/users/${userId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    fetchUsers();
  }

  async function changeRole(userId: string, role: User["role"]) {
    await fetch(`${API}/users/${userId}/role`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${getToken()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ role }),
    });
    fetchUsers();
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
          <h1 className="text-base font-semibold">Utilisateurs</h1>
          {currentUser?.role === "SUPER_ADMIN" && (
            <Button size="sm" onClick={() => setShowInvite(true)}>
              <Plus className="h-3.5 w-3.5" />
              Inviter
            </Button>
          )}
        </header>

        <div className="flex-1 overflow-auto p-5">
          {loading ? (
            <div className="flex items-center justify-center py-24">
              <p className="text-sm text-muted">Chargement...</p>
            </div>
          ) : (
            <div className="rounded-xl border border-border bg-surface overflow-hidden">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs font-medium text-muted bg-surface-sunken">
                    <th className="px-5 py-3">Utilisateur</th>
                    <th className="px-4 py-3">Rôle</th>
                    <th className="px-4 py-3">Permissions</th>
                    <th className="px-4 py-3">Magasins</th>
                    <th className="px-4 py-3">Statut</th>
                    <th className="px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id} className="border-b border-border hover:bg-surface-sunken transition-colors">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-white">
                            {u.name[0]?.toUpperCase()}
                          </div>
                          <div>
                            <p className="text-sm font-medium">{u.name}</p>
                            <p className="text-xs text-muted">{u.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <select
                          value={u.role}
                          onChange={(e) => changeRole(u.id, e.target.value as User["role"])}
                          disabled={u.id === currentUser?.id}
                          className={cn(
                            "rounded-full px-2 py-1 text-xs font-medium border-0 cursor-pointer",
                            ROLE_COLORS[u.role]
                          )}
                        >
                          <option value="SUPER_ADMIN">Super Admin</option>
                          <option value="STORE_MANAGER">Manager</option>
                          <option value="STAFF">Staff</option>
                        </select>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => setPermissionsUser(u)}
                          className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-surface-sunken transition-colors"
                        >
                          <Shield className="h-3.5 w-3.5 text-primary" />
                          {u.permissions?.length ?? 0} permissions
                        </button>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted">
                        {u.storeAccess?.length > 0
                          ? u.storeAccess.map((sa) =>
                              stores.find((s) => s.id === sa.storeId)?.name ?? sa.storeId
                            ).join(", ")
                          : "Tous"}
                      </td>
                      <td className="px-4 py-3">
                        <span className={cn(
                          "inline-flex items-center rounded-full px-2 py-1 text-xs font-medium",
                          u.isActive
                            ? "bg-status-delivered-bg text-status-delivered"
                            : "bg-status-cancelled-bg text-status-cancelled"
                        )}>
                          {u.isActive ? "Actif" : "Inactif"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => toggleActive(u.id)}
                            disabled={u.id === currentUser?.id}
                            className="rounded-md p-1.5 text-muted hover:bg-surface-sunken hover:text-foreground disabled:opacity-40"
                            title={u.isActive ? "Désactiver" : "Activer"}
                          >
                            {u.isActive
                              ? <ToggleRight className="h-4 w-4 text-status-delivered" />
                              : <ToggleLeft className="h-4 w-4" />
                            }
                          </button>
                          <button
                            onClick={() => removeUser(u.id)}
                            disabled={u.id === currentUser?.id}
                            className="rounded-md p-1.5 text-muted hover:bg-surface-sunken hover:text-status-cancelled disabled:opacity-40"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {users.length === 0 && (
                <div className="flex flex-col items-center justify-center py-16">
                  <Users className="h-8 w-8 text-muted-light" />
                  <p className="mt-2 text-sm font-medium">Aucun utilisateur</p>
                  <p className="mt-1 text-xs text-muted">Invitez des membres de votre équipe.</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {showInvite && (
        <InviteModal
          stores={accessibleStores}
          onClose={() => setShowInvite(false)}
          onInvited={(url, email) => {
            setInviteResult({ url, email });
            fetchUsers();
          }}
        />
      )}

      {permissionsUser && (
        <PermissionsModal
          user={permissionsUser}
          onClose={() => setPermissionsUser(null)}
          onSaved={(permissions) => {
            setUsers((prev) =>
              prev.map((u) => u.id === permissionsUser.id ? { ...u, permissions } : u)
            );
            setPermissionsUser(null);
          }}
        />
      )}

      {inviteResult && (
        <InviteLinkModal
          inviteUrl={inviteResult.url}
          email={inviteResult.email}
          onClose={() => setInviteResult(null)}
        />
      )}
    </div>
  );
}

export default function UsersPage() {
  return (
    <RouteGuard>
      <UsersContent />
    </RouteGuard>
  );
}