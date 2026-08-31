"use client";

import { useState, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import { useStores } from "@/lib/stores-context";
import { NotificationCenter } from "@/components/layout/notification-center";
import {
  LayoutGrid, Phone, Package, Truck, RotateCcw, QrCode, Archive,
  Users, MessageSquare, AlertCircle, ShoppingBag, TrendingUp,
  Megaphone, StoreIcon, Plug, Settings, LogOut, ChevronDown,
  Check, Circle,
} from "lucide-react";

const NAV_GROUPS = [
  {
    key: "commandes",
    label: "Commandes",
    items: [
      { label: "Confirmation", icon: Phone, href: "/confirmation", permission: "confirmation" },
      { label: "Préparation", icon: Package, href: "/preparation", permission: "preparation" },
      { label: "Livraison", icon: Truck, href: "/fulfillment", permission: "fulfillment" },
      { label: "Retours", icon: RotateCcw, href: "/retours", permission: "retours" },
      { label: "Archives", icon: Archive, href: "/archives", permission: "archives" },
      { label: "Scanner", icon: QrCode, href: "/scanner", permission: "scanner" },
    ],
  },
  {
    key: "clients",
    label: "Clients & Ventes",
    items: [
      { label: "Clients", icon: Users, href: "/clients", permission: "clients" },
      { label: "Commentaires", icon: MessageSquare, href: "/comments", permission: "comments" },
      { label: "Réclamations", icon: AlertCircle, href: "/reclamation", permission: "reclamation" },
      { label: "Messagerie", icon: MessageSquare, href: "/inbox", permission: "inbox" },
    ],
  },
  {
    key: "catalogue",
    label: "Catalogue",
    items: [
      { label: "Produits & Stock", icon: ShoppingBag, href: "/products", permission: "products" },
      { label: "Bundles", icon: Package, href: "/bundles", permission: "products" },
    ],
  },
  {
    key: "equipe",
    label: "Équipe",
    items: [
      { label: "Performance", icon: TrendingUp, href: "/agents", permission: "agents" },
      { label: "Chat équipe", icon: MessageSquare, href: "/chat", permission: "chat" },
      { label: "Marketing", icon: Megaphone, href: "/marketing", permission: "marketing" },
    ],
  },
  {
    key: "config",
    label: "Configuration",
    items: [
      { label: "Magasins", icon: StoreIcon, href: "/stores", permission: "stores" },
      { label: "Livraison", icon: Truck, href: "/shipping", permission: "integrations" },
      { label: "Intégrations", icon: Plug, href: "/integrations", permission: "integrations" },
      { label: "Utilisateurs", icon: Users, href: "/users", permission: "users" },
      { label: "Paramètres", icon: Settings, href: "/settings", permission: "settings" },
    ],
  },
];

interface SidebarProps {
  stores: { id: string; name: string; isActive?: boolean; sourceType?: string }[];
  selectedStoreIds: string[];
  onChangeSelectedStores: (ids: string[]) => void;
}

export function Sidebar({ stores, selectedStoreIds, onChangeSelectedStores }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout, hasPermission } = useAuth();
  const [storeOpen, setStoreOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  // Which group contains the active page
  const activeGroup = NAV_GROUPS.find((g) =>
    g.items.some((item) => item.href === pathname)
  )?.key ?? "commandes";

  const [openGroups, setOpenGroups] = useState<string[]>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem("orderly_nav_groups");
        if (saved) return JSON.parse(saved);
      } catch {}
    }
    return [activeGroup];
  });

  // Auto-open the group of the active page
  useEffect(() => {
    if (activeGroup && !openGroups.includes(activeGroup)) {
      const next = [...openGroups, activeGroup];
      setOpenGroups(next);
      localStorage.setItem("orderly_nav_groups", JSON.stringify(next));
    }
  }, [pathname]);

  function toggleGroup(key: string) {
    const next = openGroups.includes(key)
      ? openGroups.filter((k) => k !== key)
      : [...openGroups, key];
    setOpenGroups(next);
    if (typeof window !== "undefined") {
      localStorage.setItem("orderly_nav_groups", JSON.stringify(next));
    }
  }

  function selectAll() {
    onChangeSelectedStores(stores.map((s) => s.id));
  }

  function toggleStore(id: string) {
    if (selectedStoreIds.includes(id)) {
      if (selectedStoreIds.length > 1) {
        onChangeSelectedStores(selectedStoreIds.filter((s) => s !== id));
      }
    } else {
      onChangeSelectedStores([...selectedStoreIds, id]);
    }
  }

  return (
    <aside className="flex h-screen w-56 shrink-0 flex-col border-r border-border bg-surface">

      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-3 py-3">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-xs font-bold text-white">
            O
          </div>
          <span className="text-sm font-semibold">Orderly</span>
        </div>
        <div className="flex items-center gap-1">
          <NotificationCenter />
          <div className="relative">
            <button
              onClick={() => setUserMenuOpen((v) => !v)}
              className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-xs font-bold text-white hover:opacity-90"
              title={user?.name}
            >
              {user?.name?.[0]?.toUpperCase() ?? "U"}
            </button>
            {userMenuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setUserMenuOpen(false)} />
                <div className="absolute right-0 top-9 z-50 w-48 rounded-xl border border-border bg-surface shadow-xl">
                  <div className="border-b border-border px-3 py-2.5">
                    <p className="truncate text-xs font-semibold">{user?.name}</p>
                    <p className="truncate text-[11px] text-muted">{user?.email}</p>
                  </div>
                  <div className="p-1">
                    <button
                      onClick={() => { router.push("/settings"); setUserMenuOpen(false); }}
                      className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-xs text-muted hover:bg-surface-sunken hover:text-foreground"
                    >
                      <Settings className="h-3.5 w-3.5" />
                      Paramètres
                    </button>
                    <button
                      onClick={() => { logout(); setUserMenuOpen(false); }}
                      className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-xs text-status-cancelled hover:bg-status-cancelled-bg"
                    >
                      <LogOut className="h-3.5 w-3.5" />
                      Déconnexion
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Vue d'ensemble */}
      <div className="border-b border-border px-2 py-1.5">
        <button
          onClick={() => router.push("/")}
          className={cn(
            "flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
            pathname === "/"
              ? "bg-primary text-white"
              : "text-muted hover:bg-surface-sunken hover:text-foreground"
          )}
        >
          <LayoutGrid className="h-3.5 w-3.5 shrink-0" />
          Vue d'ensemble
        </button>
      </div>

      {/* Store selector */}
      <div className="border-b border-border px-3 py-2">
        <button
          onClick={() => setStoreOpen((v) => !v)}
          className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-xs font-medium hover:bg-surface-sunken"
        >
          <span className="truncate text-muted">
            {selectedStoreIds.length === stores.length
              ? "Tous les magasins"
              : selectedStoreIds.length === 1
              ? stores.find((s) => s.id === selectedStoreIds[0])?.name ?? "1 magasin"
              : `${selectedStoreIds.length} magasins`}
          </span>
          <ChevronDown className={cn("h-3.5 w-3.5 text-muted transition-transform", storeOpen && "rotate-180")} />
        </button>

        {storeOpen && (
          <div className="mt-1 rounded-md border border-border bg-surface shadow-md">
            <button
              onClick={selectAll}
              className="flex w-full items-center justify-between px-3 py-2 text-xs hover:bg-surface-sunken"
            >
              <span>Tous les magasins</span>
              {selectedStoreIds.length === stores.length && <Check className="h-3 w-3 text-primary" />}
            </button>
            {stores.map((store) => (
              <button
                key={store.id}
                onClick={() => toggleStore(store.id)}
                className="flex w-full items-center justify-between px-3 py-2 text-xs hover:bg-surface-sunken"
              >
                <span className="flex items-center gap-2">
                  <Circle className={cn("h-2 w-2 fill-current", store.isActive ? "text-status-delivered" : "text-muted")} />
                  <span className="truncate">{store.name}</span>
                </span>
                {selectedStoreIds.includes(store.id) && <Check className="h-3 w-3 text-primary" />}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Nav groups */}
      <nav className="flex-1 overflow-y-auto py-2">
        {NAV_GROUPS.map((group) => {
          const visible = group.items.filter(
            (item) => !item.permission || hasPermission(item.permission)
          );
          if (visible.length === 0) return null;

          const isOpen = openGroups.includes(group.key);
          const hasActive = visible.some((item) => item.href === pathname);

          return (
            <div key={group.key} className="mb-0.5">
              <button
                onClick={() => toggleGroup(group.key)}
                className={cn(
                  "flex w-full items-center justify-between px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider transition-colors",
                  hasActive ? "text-primary" : "text-muted-light hover:text-muted"
                )}
              >
                <span>{group.label}</span>
                <ChevronDown
                  className={cn(
                    "h-3 w-3 transition-transform",
                    isOpen && "rotate-180"
                  )}
                />
              </button>

              {isOpen && (
                <div className="pb-1">
                  {visible.map((item) => {
                    const Icon = item.icon;
                    const active = pathname === item.href;
                    return (
                      <button
                        key={item.href}
                        onClick={() => router.push(item.href)}
                        className={cn(
                          "flex w-full items-center gap-2.5 rounded-md mx-1 px-2.5 py-1.5 text-xs font-medium transition-colors",
                          active
                            ? "bg-primary text-white"
                            : "text-muted hover:bg-surface-sunken hover:text-foreground"
                        )}
                      >
                        <Icon className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{item.label}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="border-t border-border px-3 py-2.5">
        <p className="truncate text-xs font-medium">{user?.name}</p>
        <p className="truncate text-[11px] text-muted">{user?.email}</p>
      </div>
    </aside>
  );
}