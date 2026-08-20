"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Store } from "@/types/order";
import { useAuth } from "@/lib/auth-context";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutGrid,
  Package,
  Store as StoreIcon,
  Bell,
  Settings,
  Users,
  Plug,
  ChevronDown,
  Check,
  Circle,
  LogOut,
  ShoppingBag,
  Phone,
  Truck,
  QrCode,
  AlertCircle,
  MessageSquare,
  RotateCcw,
  Archive,
  TrendingUp,
  Megaphone,
} from "lucide-react";
import { NotificationCenter } from "@/components/layout/notification-center";

const NAV_ITEMS: { label: string; icon: React.ElementType; href: string; badge?: number; permission?: string }[] = [
  { label: "Vue d'ensemble", icon: LayoutGrid, href: "/" },
  { label: "Confirmation", icon: Phone, href: "/confirmation", permission: "confirmation" },
  { label: "Préparation", icon: Package, href: "/preparation", permission: "preparation" },
  { label: "Livraison", icon: Truck, href: "/fulfillment", permission: "fulfillment" },
  { label: "Retours", icon: RotateCcw, href: "/retours", permission: "retours" },
  { label: "Réclamations", icon: AlertCircle, href: "/reclamation", permission: "reclamation" },
  { label: "Clients", icon: Users, href: "/clients", permission: "clients" },
  { label: "Marketing", icon: Megaphone, href: "/marketing", permission: "marketing" },
  { label: "Performance", icon: TrendingUp, href: "/agents", permission: "agents" },
  { label: "Archives", icon: Archive, href: "/archives", permission: "archives" },
  { label: "Produits", icon: ShoppingBag, href: "/products", permission: "products" },
  { label: "Messagerie", icon: MessageSquare, href: "/inbox", permission: "inbox" },
  { label: "Chat équipe", icon: MessageSquare, href: "/chat", permission: "chat" },
  { label: "Scanner QR", icon: QrCode, href: "/scanner", permission: "scanner" },
  { label: "Magasins", icon: StoreIcon, href: "/stores", permission: "stores" },
  { label: "Utilisateurs", icon: Users, href: "/users", permission: "users" },
  { label: "Intégrations", icon: Plug, href: "/integrations", permission: "integrations" },
  { label: "Paramètres", icon: Settings, href: "/settings", permission: "settings" },
];

interface SidebarProps {
  stores: Store[];
  selectedStoreIds: string[];
  onChangeSelectedStores: (ids: string[]) => void;
}

export function Sidebar({ stores, selectedStoreIds, onChangeSelectedStores }: SidebarProps) {
  const { user, logout, canAccessStore, hasPermission } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [storeOpen, setStoreOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  function toggleStore(id: string) {
    if (selectedStoreIds.includes(id)) {
      if (selectedStoreIds.length === 1) return;
      onChangeSelectedStores(selectedStoreIds.filter((s) => s !== id));
    } else {
      onChangeSelectedStores([...selectedStoreIds, id]);
    }
  }

  function selectAll() {
    onChangeSelectedStores(stores.map((s) => s.id));
    setStoreOpen(false);
  }

  const visibleNavItems = NAV_ITEMS.filter(
    (item) => !item.permission || hasPermission(item.permission)
  );

  return (
    <aside className="flex h-screen w-56 shrink-0 flex-col border-r border-border bg-surface">

      {/* Top — Logo + Notifications + Account */}
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
                    <p className="text-xs font-semibold truncate">{user?.name}</p>
                    <p className="text-[11px] text-muted truncate">{user?.email}</p>
                    <span className="mt-1 inline-block rounded bg-primary-soft px-1.5 py-0.5 text-[10px] font-medium text-primary">
                      {user?.role === "SUPER_ADMIN" ? "Super Admin" : user?.role === "STORE_MANAGER" ? "Manager" : "Staff"}
                    </span>
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

      {/* Store selector */}
      <div className="border-b border-border px-3 py-2">
        <button
          onClick={() => setStoreOpen((v) => !v)}
          className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-xs font-medium hover:bg-surface-sunken"
        >
          <span className="truncate text-muted">
            {selectedStoreIds.length === stores.length
              ? "All stores"
              : selectedStoreIds.length === 1
              ? stores.find((s) => s.id === selectedStoreIds[0])?.name ?? "1 store"
              : `${selectedStoreIds.length} stores`}
          </span>
          <ChevronDown className={cn("h-3.5 w-3.5 text-muted transition-transform", storeOpen && "rotate-180")} />
        </button>

        {storeOpen && (
          <div className="mt-1 rounded-md border border-border bg-surface shadow-md">
            <button
              onClick={selectAll}
              className="flex w-full items-center justify-between px-3 py-2 text-xs hover:bg-surface-sunken"
            >
              <span>All stores</span>
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
                <span className="shrink-0 text-[10px] text-muted">
                  {store.sourceType === "SHOPIFY" ? "Shopify" : store.sourceType === "MARKETPLACE" ? "Marketplace" : "Custom"}
                </span>
                {selectedStoreIds.includes(store.id) && <Check className="h-3 w-3 text-primary" />}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-2 py-2">
        {visibleNavItems.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href;
          return (
            <button
              key={item.href}
              onClick={() => router.push(item.href)}
              className={cn(
                "flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-xs font-medium transition-colors",
                active
                  ? "bg-primary-soft text-primary"
                  : "text-muted hover:bg-surface-sunken hover:text-foreground"
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="truncate">{item.label}</span>
              {item.badge !== undefined && item.badge > 0 && (
                <span className="ml-auto rounded-full bg-status-cancelled px-1.5 py-0.5 text-[10px] font-bold text-white">
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Bottom */}
      <div className="border-t border-border px-3 py-2.5">
        <p className="text-xs font-medium truncate">{user?.name}</p>
        <p className="text-[11px] text-muted truncate">{user?.email}</p>
      </div>
    </aside>
  );
}