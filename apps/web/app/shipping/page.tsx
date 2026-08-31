"use client";

import { useState, useEffect, useCallback } from "react";
import { Sidebar } from "@/components/layout/sidebar";
import { RouteGuard } from "@/components/auth/route-guard";
import { useStores } from "@/lib/stores-context";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Plus, X, Truck, Trash2, Settings2 } from "lucide-react";
import { COSMOS_CITIES } from "@/components/orders/city-picker";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api";

function getToken() {
  return window.localStorage.getItem("orderly_token");
}

function RuleModal({
  stores,
  rule,
  onClose,
  onSaved,
}: {
  stores: { id: string; name: string }[];
  rule?: any;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [storeId, setStoreId] = useState(rule?.storeId ?? stores[0]?.id ?? "");
  const [name, setName] = useState(rule?.name ?? "Livraison standard");
  const [basePrice, setBasePrice] = useState(String(rule?.basePrice ?? "7"));
  const [freeThreshold, setFreeThreshold] = useState(
    rule?.freeThreshold ? String(rule.freeThreshold) : ""
  );
  const [overrides, setOverrides] = useState<Record<string, string>>(() => {
    const o = rule?.cityOverrides ?? {};
    const result: Record<string, string> = {};
    Object.entries(o).forEach(([k, v]) => { result[k] = String(v); });
    return result;
  });
  const [showOverrides, setShowOverrides] = useState(
    Object.keys(rule?.cityOverrides ?? {}).length > 0
  );
  const [loading, setLoading] = useState(false);

  async function save() {
    setLoading(true);
    try {
      const cityOverrides: Record<string, number> = {};
      Object.entries(overrides).forEach(([city, val]) => {
        const n = parseFloat(val);
        if (!isNaN(n)) cityOverrides[city] = n;
      });

      const body = {
        storeId,
        name,
        basePrice: parseFloat(basePrice) || 0,
        freeThreshold: freeThreshold ? parseFloat(freeThreshold) : null,
        cityOverrides: Object.keys(cityOverrides).length > 0 ? cityOverrides : null,
      };

      if (rule) {
        await fetch(`${API}/shipping/rules/${rule.id}`, {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${getToken()}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        });
      } else {
        await fetch(`${API}/shipping/rules`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${getToken()}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        });
      }
      onSaved();
      onClose();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-foreground/30 backdrop-blur-[2px]">
      <div className="flex max-h-[92vh] w-full max-w-md flex-col rounded-xl border border-border bg-surface shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-sm font-semibold">
            {rule ? "Modifier la règle" : "Nouvelle règle de livraison"}
          </h2>
          <button onClick={onClose} className="rounded-md p-1 hover:bg-surface-sunken">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">Magasin</label>
            <select
              value={storeId}
              onChange={(e) => setStoreId(e.target.value)}
              disabled={!!rule}
              className="h-9 w-full rounded-md border border-border bg-surface px-2 text-sm focus-visible:outline-none disabled:opacity-50"
            >
              {stores.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-muted">Nom de la règle</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-muted">
              Prix de livraison standard (TND)
            </label>
            <Input
              type="number"
              value={basePrice}
              onChange={(e) => setBasePrice(e.target.value)}
              step="0.001"
              min={0}
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-muted">
              Livraison gratuite à partir de (TND)
            </label>
            <Input
              type="number"
              value={freeThreshold}
              onChange={(e) => setFreeThreshold(e.target.value)}
              placeholder="Laisser vide pour désactiver"
              step="0.001"
              min={0}
            />
            <p className="mt-1 text-[11px] text-muted">
              Si le sous-total dépasse ce montant, la livraison devient gratuite
            </p>
          </div>

          <div>
            <button
              onClick={() => setShowOverrides((v) => !v)}
              className="text-xs font-medium text-primary hover:underline"
            >
              {showOverrides ? "Masquer" : "Définir"} des tarifs par gouvernorat
            </button>

            {showOverrides && (
              <div className="mt-2 max-h-48 space-y-1.5 overflow-y-auto rounded-lg border border-border p-3">
                {COSMOS_CITIES.map((city) => (
                  <div key={city} className="flex items-center gap-2">
                    <span className="flex-1 text-xs">{city}</span>
                    <Input
                      type="number"
                      value={overrides[city] ?? ""}
                      onChange={(e) =>
                        setOverrides((prev) => ({ ...prev, [city]: e.target.value }))
                      }
                      placeholder="défaut"
                      step="0.001"
                      min={0}
                      className="h-7 w-20 text-xs"
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex gap-2 border-t border-border px-5 py-4">
          <Button variant="secondary" className="flex-1" onClick={onClose}>Annuler</Button>
          <Button className="flex-1" disabled={loading} onClick={save}>
            {loading ? "Enregistrement..." : "Enregistrer"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function ShippingContent() {
  const { canAccessStore } = useAuth();
  const { stores } = useStores();
  const [selectedStoreIds, setSelectedStoreIds] = useState<string[]>([]);
  const [rules, setRules] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editRule, setEditRule] = useState<any>(null);

  const accessibleStores = stores.filter((s) => canAccessStore(s.id));

  useEffect(() => {
    if (stores.length > 0 && selectedStoreIds.length === 0) {
      setSelectedStoreIds(stores.map((s) => s.id));
    }
  }, [stores]);

  const fetchRules = useCallback(async () => {
    if (selectedStoreIds.length === 0) return;
    setLoading(true);
    try {
      const res = await fetch(
        `${API}/shipping/rules?storeIds=${selectedStoreIds.join(",")}`,
        { headers: { Authorization: `Bearer ${getToken()}` } }
      );
      const data = await res.json();
      setRules(Array.isArray(data) ? data : []);
    } catch {
      setRules([]);
    } finally {
      setLoading(false);
    }
  }, [selectedStoreIds]);

  useEffect(() => {
    fetchRules();
  }, [fetchRules]);

  async function removeRule(id: string) {
    if (!window.confirm("Supprimer cette règle ?")) return;
    await fetch(`${API}/shipping/rules/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    fetchRules();
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
          <div>
            <h1 className="text-base font-semibold">Règles de livraison</h1>
            <p className="text-xs text-muted">Tarifs et gratuité par magasin</p>
          </div>
          <Button size="sm" onClick={() => { setEditRule(null); setShowModal(true); }}>
            <Plus className="h-3.5 w-3.5" />
            Nouvelle règle
          </Button>
        </header>

        <div className="flex-1 overflow-y-auto p-5">
          {loading ? (
            <p className="py-16 text-center text-sm text-muted">Chargement...</p>
          ) : rules.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24">
              <Truck className="h-8 w-8 text-muted-light" />
              <p className="mt-2 text-sm font-medium">Aucune règle de livraison</p>
              <p className="mt-1 text-center text-xs text-muted max-w-sm">
                Définissez le prix de livraison et le seuil de gratuité pour chaque magasin.
              </p>
              <Button size="sm" className="mt-4" onClick={() => { setEditRule(null); setShowModal(true); }}>
                <Plus className="h-3.5 w-3.5" />
                Créer une règle
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              {rules.map((r) => {
                const overrideCount = Object.keys(r.cityOverrides ?? {}).length;
                return (
                  <div key={r.id} className="rounded-xl border border-border bg-surface p-5">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                          <Truck className="h-5 w-5" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold">{r.name}</p>
                          <p className="text-xs text-muted">{r.store?.name}</p>
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <button
                          onClick={() => { setEditRule(r); setShowModal(true); }}
                          className="rounded-md p-1.5 text-muted hover:bg-surface-sunken"
                        >
                          <Settings2 className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => removeRule(r.id)}
                          className="rounded-md p-1.5 text-muted hover:bg-status-cancelled-bg hover:text-status-cancelled"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>

                    <div className="mt-4 space-y-2">
                      <div className="flex justify-between rounded-lg bg-surface-sunken px-3 py-2">
                        <span className="text-xs text-muted">Prix standard</span>
                        <span className="font-mono text-sm font-bold">
                          {Number(r.basePrice).toFixed(3)} TND
                        </span>
                      </div>
                      {r.freeThreshold && (
                        <div className="flex justify-between rounded-lg bg-status-delivered-bg px-3 py-2">
                          <span className="text-xs text-status-delivered">Gratuite dès</span>
                          <span className="font-mono text-sm font-bold text-status-delivered">
                            {Number(r.freeThreshold).toFixed(3)} TND
                          </span>
                        </div>
                      )}
                      {overrideCount > 0 && (
                        <p className="text-[11px] text-muted">
                          {overrideCount} tarif{overrideCount > 1 ? "s" : ""} par gouvernorat défini{overrideCount > 1 ? "s" : ""}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {showModal && (
        <RuleModal
          stores={accessibleStores}
          rule={editRule}
          onClose={() => { setShowModal(false); setEditRule(null); }}
          onSaved={fetchRules}
        />
      )}
    </div>
  );
}

export default function ShippingPage() {
  return (
    <RouteGuard>
      <ShippingContent />
    </RouteGuard>
  );
}