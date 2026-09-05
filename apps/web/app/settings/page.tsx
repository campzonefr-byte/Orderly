"use client";

import { useState, useEffect } from "react";
import { Sidebar } from "@/components/layout/sidebar";
import { RouteGuard } from "@/components/auth/route-guard";
import { useStores } from "@/lib/stores-context";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { User, Bell, Shield, Palette, Building2, Check } from "lucide-react";

const TABS = [
  { key: "profile", label: "Profile", icon: User },
  { key: "notifications", label: "Notifications", icon: Bell },
  { key: "security", label: "Security", icon: Shield },
  { key: "appearance", label: "Appearance", icon: Palette },
  { key: "company", label: "Company", icon: Building2 },
] as const;

type Tab = (typeof TABS)[number]["key"];

function SavedBanner() {
  return (
    <div className="flex items-center gap-2 rounded-md bg-status-delivered-bg px-3 py-2 text-xs font-medium text-status-delivered">
      <Check className="h-3.5 w-3.5" />
      Changes saved
    </div>
  );
}

function ProfileTab({ user }: { user: NonNullable<ReturnType<typeof useAuth>["user"]> }) {
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email);
  const [saved, setSaved] = useState(false);

  function save() { setSaved(true); setTimeout(() => setSaved(false), 3000); }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-sm font-semibold">Profile</h2>
        <p className="mt-0.5 text-xs text-muted">Update your personal information.</p>
      </div>
      <div className="flex items-center gap-4">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary-soft text-xl font-bold text-primary">
          {user.avatarInitials}
        </div>
        <div>
          <p className="text-sm font-medium">{user.name}</p>
          <p className="text-xs text-muted">{user.email}</p>
          <span className="mt-1 inline-block rounded bg-surface-sunken px-2 py-0.5 text-[11px] text-muted">
            {user.role.replace("_", " ")}
          </span>
        </div>
      </div>
      <div className="space-y-4 rounded-lg border border-border p-5">
        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted">Full name</label>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted">Email address</label>
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
      </div>
      <div className="flex items-center gap-3">
        <Button onClick={save}>Save changes</Button>
        {saved && <SavedBanner />}
      </div>
    </div>
  );
}

function NotificationsTab() {
  const [settings, setSettings] = useState({
    newOrder: true, orderCancelled: true, lowStock: true,
    orderDelivered: false, dailyDigest: true, weeklyReport: false,
  });
  const [saved, setSaved] = useState(false);

  function toggle(key: keyof typeof settings) {
    setSettings((prev) => ({ ...prev, [key]: !prev[key] }));
  }
  function save() { setSaved(true); setTimeout(() => setSaved(false), 3000); }

  const ITEMS = [
    { key: "newOrder", label: "New order", desc: "When a new order comes in from any connected store" },
    { key: "orderCancelled", label: "Order cancelled", desc: "When an order is cancelled or voided" },
    { key: "lowStock", label: "Low stock alert", desc: "When a product drops below its threshold" },
    { key: "orderDelivered", label: "Order delivered", desc: "When courier marks an order as delivered" },
    { key: "dailyDigest", label: "Daily digest", desc: "Summary of orders, revenue and alerts each morning" },
    { key: "weeklyReport", label: "Weekly report", desc: "Full weekly performance report every Monday" },
  ] as const;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-sm font-semibold">Notifications</h2>
        <p className="mt-0.5 text-xs text-muted">Choose what you get notified about.</p>
      </div>
      <div className="space-y-1 rounded-lg border border-border divide-y divide-border">
        {ITEMS.map((item) => (
          <div key={item.key} className="flex items-center justify-between px-5 py-4">
            <div>
              <p className="text-sm font-medium">{item.label}</p>
              <p className="text-xs text-muted">{item.desc}</p>
            </div>
            <button
              onClick={() => toggle(item.key)}
              className={cn("relative h-5 w-9 rounded-full transition-colors", settings[item.key] ? "bg-primary" : "bg-border-strong")}
            >
              <span className={cn("absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform", settings[item.key] ? "translate-x-4" : "translate-x-0.5")} />
            </button>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-3">
        <Button onClick={save}>Save preferences</Button>
        {saved && <SavedBanner />}
      </div>
    </div>
  );
}

function SecurityTab() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  function save() {
    setError("");
    if (!current || !next || !confirm) { setError("All fields required."); return; }
    if (next !== confirm) { setError("New passwords don't match."); return; }
    if (next.length < 8) { setError("Password must be at least 8 characters."); return; }
    setSaved(true);
    setCurrent(""); setNext(""); setConfirm("");
    setTimeout(() => setSaved(false), 3000);
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-sm font-semibold">Security</h2>
        <p className="mt-0.5 text-xs text-muted">Manage your password and account security.</p>
      </div>
      <div className="space-y-4 rounded-lg border border-border p-5">
        <h3 className="text-xs font-medium uppercase tracking-wide text-muted">Change password</h3>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted">Current password</label>
          <Input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} placeholder="••••••••" />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted">New password</label>
          <Input type="password" value={next} onChange={(e) => setNext(e.target.value)} placeholder="••••••••" />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted">Confirm new password</label>
          <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="••••••••" />
        </div>
        {error && (
          <p className="rounded-md bg-status-cancelled-bg px-3 py-2 text-xs font-medium text-status-cancelled">{error}</p>
        )}
      </div>
      <div className="flex items-center gap-3">
        <Button onClick={save}>Update password</Button>
        {saved && <SavedBanner />}
      </div>
      <div className="rounded-lg border border-border p-5 space-y-3">
        <h3 className="text-xs font-medium uppercase tracking-wide text-muted">Active sessions</h3>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Current session</p>
            <p className="text-xs text-muted">Started this session · This device</p>
          </div>
          <span className="rounded bg-status-delivered-bg px-2 py-1 text-[11px] font-medium text-status-delivered">Active</span>
        </div>
      </div>
    </div>
  );
}

function AppearanceTab() {
  const [theme, setTheme] = useState<"light" | "system">("light");
  const [density, setDensity] = useState<"comfortable" | "compact">("comfortable");
  const [saved, setSaved] = useState(false);

  function save() { setSaved(true); setTimeout(() => setSaved(false), 3000); }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-sm font-semibold">Appearance</h2>
        <p className="mt-0.5 text-xs text-muted">Customize how Orderly looks for you.</p>
      </div>
      <div className="space-y-4 rounded-lg border border-border p-5">
        <h3 className="text-xs font-medium uppercase tracking-wide text-muted">Theme</h3>
        <div className="flex gap-3">
          {(["light", "system"] as const).map((t) => (
            <button key={t} onClick={() => setTheme(t)} className={cn("flex-1 rounded-lg border-2 p-4 text-left transition-colors", theme === t ? "border-primary bg-primary-soft" : "border-border hover:border-border-strong")}>
              <p className="text-sm font-medium capitalize">{t}</p>
              <p className="mt-0.5 text-xs text-muted">{t === "light" ? "Always use light mode" : "Follow system preference"}</p>
            </button>
          ))}
        </div>
      </div>
      <div className="space-y-4 rounded-lg border border-border p-5">
        <h3 className="text-xs font-medium uppercase tracking-wide text-muted">Table density</h3>
        <div className="flex gap-3">
          {(["comfortable", "compact"] as const).map((d) => (
            <button key={d} onClick={() => setDensity(d)} className={cn("flex-1 rounded-lg border-2 p-4 text-left transition-colors", density === d ? "border-primary bg-primary-soft" : "border-border hover:border-border-strong")}>
              <p className="text-sm font-medium capitalize">{d}</p>
              <p className="mt-0.5 text-xs text-muted">{d === "comfortable" ? "More padding, easier to read" : "Denser rows, more data visible"}</p>
            </button>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-3">
        <Button onClick={save}>Save preferences</Button>
        {saved && <SavedBanner />}
      </div>
    </div>
  );
}

function CompanyTab() {
  const [name, setName] = useState("Orderly Inc.");
  const [timezone, setTimezone] = useState("Africa/Tunis");
  const [currency, setCurrency] = useState("TND");
  const [saved, setSaved] = useState(false);

  function save() { setSaved(true); setTimeout(() => setSaved(false), 3000); }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-sm font-semibold">Company</h2>
        <p className="mt-0.5 text-xs text-muted">Global settings that apply across all stores.</p>
      </div>
      <div className="space-y-4 rounded-lg border border-border p-5">
        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted">Company name</label>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted">Default timezone</label>
          <Input value={timezone} onChange={(e) => setTimezone(e.target.value)} />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted">Default currency</label>
          <Input value={currency} onChange={(e) => setCurrency(e.target.value)} />
        </div>
      </div>
      <div className="rounded-lg border border-border p-5 space-y-3">
        <h3 className="text-xs font-medium uppercase tracking-wide text-muted">Danger zone</h3>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Reset all data</p>
            <p className="text-xs text-muted">Clears all mock orders and resets to defaults. Cannot be undone.</p>
          </div>
          <Button variant="destructive" size="sm">Reset data</Button>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <Button onClick={save}>Save settings</Button>
        {saved && <SavedBanner />}
      </div>
    </div>
  );
}

function SettingsContent() {
  const { user, canAccessStore } = useAuth();
  const { stores } = useStores();
  const [tab, setTab] = useState<Tab>("profile");
  const [selectedStoreIds, setSelectedStoreIds] = useState<string[]>([]);

  useEffect(() => {
    if (stores.length > 0 && selectedStoreIds.length === 0) {
      setSelectedStoreIds(stores.map((s) => s.id));
    }
  }, [stores]);

  if (!user) return null;

  return (
    <div className="flex h-screen bg-background">
      <Sidebar
        stores={stores.filter((s) => canAccessStore(s.id))}
        selectedStoreIds={selectedStoreIds}
        onChangeSelectedStores={setSelectedStoreIds}
      />
      <div className="flex min-w-0 max-w-full flex-1 flex-col overflow-x-hidden pt-14 md:pt-0">
        <header className="flex h-14 shrink-0 items-center border-b border-border bg-surface px-5">
          <h1 className="text-base font-semibold">Settings</h1>
        </header>
        <div className="flex flex-1 overflow-hidden">
          <nav className="w-48 shrink-0 border-r border-border bg-surface p-3 space-y-0.5">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  tab === t.key ? "bg-primary-soft text-primary" : "text-muted hover:bg-surface-sunken hover:text-foreground"
                )}
              >
                <t.icon className="h-4 w-4" />
                {t.label}
              </button>
            ))}
          </nav>
          <div className="flex-1 overflow-y-auto p-8 max-w-2xl">
            {tab === "profile" && <ProfileTab user={user} />}
            {tab === "notifications" && <NotificationsTab />}
            {tab === "security" && <SecurityTab />}
            {tab === "appearance" && <AppearanceTab />}
            {tab === "company" && <CompanyTab />}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <RouteGuard>
      <SettingsContent />
    </RouteGuard>
  );
}