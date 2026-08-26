"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { X, ShoppingBag, Plus, Trash2, Truck, Sparkles } from "lucide-react";
import { CityPicker, isValidCity } from "@/components/orders/city-picker";
import { ProductPicker, useStoreProducts, type StoreProduct } from "@/components/orders/product-picker";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api";

function getToken() {
  return window.localStorage.getItem("orderly_token");
}

const DELIVERY_COMPANIES = ["Cosmos", "Aramex", "Tunisie Express", "Autre"];

export function ConvertCommentModal({
  comment,
  onClose,
  onConverted,
}: {
  comment: any;
  onClose: () => void;
  onConverted: () => void;
}) {
  const [name, setName] = useState(comment.detectedName ?? comment.authorName ?? "");
  const [phone, setPhone] = useState(comment.detectedPhone ?? "");
  const [phone2, setPhone2] = useState("");
  const [city, setCity] = useState(comment.detectedCity ?? "");
  const [address, setAddress] = useState("");
  const [deliveryCompany, setDeliveryCompany] = useState("Cosmos");
  const [products, setProducts] = useState
    { title: string; sku: string; quantity: number; price: number }[]
  >([{ title: "", sku: "", quantity: 1, price: 0 }]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const storeId = comment.account?.storeId;
  const { products: storeProducts, loading: loadingProducts } = useStoreProducts(storeId);

  const total = products.reduce((s, p) => s + p.price * p.quantity, 0);

  function updateProduct(idx: number, patch: any) {
    setProducts((prev) => prev.map((p, i) => (i === idx ? { ...p, ...patch } : p)));
  }

  function handleSelect(idx: number, prod: StoreProduct | null, raw: string) {
    if (prod) {
      updateProduct(idx, {
        title: prod.name,
        sku: prod.sku,
        price: (prod as any).sellPrice ?? products[idx].price,
      });
    } else {
      updateProduct(idx, { title: raw, sku: "" });
    }
  }

  async function convert() {
    if (!isValidCity(city)) {
      setError("Selectionnez un gouvernorat valide");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${API}/social/comments/${comment.id}/convert`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${getToken()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          customerName: name,
          customerPhone: phone,
          customerPhone2: phone2 || undefined,
          city,
          address,
          deliveryCompany,
          lineItems: products.filter((p) => p.title.trim()),
        }),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error ?? "Erreur");
        return;
      }
      onConverted();
      onClose();
    } catch {
      setError("Erreur reseau");
    } finally {
      setLoading(false);
    }
  }

  const canConvert =
    name.trim() && phone.trim() && isValidCity(city) && products.some((p) => p.title.trim());

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-foreground/30 backdrop-blur-[2px]">
      <div className="flex max-h-[92vh] w-full max-w-lg flex-col rounded-xl border border-border bg-surface shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold">Creer la commande</h2>
            <p className="text-xs text-muted">
              Depuis un commentaire {comment.account?.platform === "INSTAGRAM" ? "Instagram" : "Facebook"}
            </p>
          </div>
          <button onClick={onClose} className="rounded-md p-1 hover:bg-surface-sunken">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Original comment */}
          <div className="rounded-lg border border-border bg-surface-sunken p-3">
            <p className="text-[11px] font-medium text-muted">
              {comment.authorName} a ecrit
            </p>
            <p className="mt-1 text-xs">{comment.message}</p>
          </div>

          {comment.confidence >= 0.5 && (
            <div className="flex items-center gap-2 rounded-lg bg-primary-soft px-3 py-2">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              <p className="text-[11px] text-primary">
                Informations detectees automatiquement — verifiez avant de valider
              </p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="mb-1 block text-xs font-medium text-muted">Nom client</label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">Telephone</label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+216 XX XXX XXX" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">Telephone 2</label>
              <Input value={phone2} onChange={(e) => setPhone2(e.target.value)} placeholder="Optionnel" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">
                Gouvernorat <span className="text-status-cancelled">*</span>
              </label>
              <CityPicker value={city} onChange={setCity} address={address} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">Adresse</label>
              <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Rue..." />
            </div>
          </div>

          <div>
            <label className="mb-2 block text-xs font-medium text-muted">Societe de livraison</label>
            <div className="grid grid-cols-4 gap-2">
              {DELIVERY_COMPANIES.map((c) => (
                <button
                  key={c}
                  onClick={() => setDeliveryCompany(c)}
                  className={cn(
                    "flex items-center justify-center gap-1 rounded-lg border-2 px-2 py-1.5 text-[11px] font-medium transition-colors",
                    deliveryCompany === c
                      ? "border-primary bg-primary-soft text-primary"
                      : "border-border text-muted hover:border-border-strong"
                  )}
                >
                  <Truck className="h-3 w-3 shrink-0" />
                  {c}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className="text-xs font-medium text-muted">
                Produits
                <span className="ml-1 text-[10px] text-muted-light">
                  ({storeProducts.length} au catalogue)
                </span>
              </label>
              <button
                onClick={() => setProducts((p) => [...p, { title: "", sku: "", quantity: 1, price: 0 }])}
                className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              >
                <Plus className="h-3 w-3" /> Ajouter
              </button>
            </div>
            <div className="space-y-2">
              {products.map((p, idx) => (
                <div key={idx} className="rounded-lg border border-border p-2 space-y-2">
                  <div className="flex items-center gap-2">
                    <ProductPicker
                      value={p.title}
                      onSelect={(prod, raw) => handleSelect(idx, prod, raw)}
                      products={storeProducts}
                      loading={loadingProducts}
                      className="flex-1"
                    />
                    {products.length > 1 && (
                      <button
                        onClick={() => setProducts((prev) => prev.filter((_, i) => i !== idx))}
                        className="text-muted hover:text-status-cancelled"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      type="number"
                      value={p.quantity}
                      onChange={(e) => updateProduct(idx, { quantity: parseInt(e.target.value) || 1 })}
                      min={1}
                      className="h-8 text-xs"
                      placeholder="Qte"
                    />
                    <Input
                      type="number"
                      value={p.price}
                      onChange={(e) => updateProduct(idx, { price: parseFloat(e.target.value) || 0 })}
                      step="0.001"
                      className="h-8 text-xs"
                      placeholder="Prix"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg bg-surface-sunken px-3 py-2">
            <span className="text-xs font-medium text-muted">Total</span>
            <span className="font-mono text-sm font-bold">{total.toFixed(3)} TND</span>
          </div>

          {error && (
            <p className="rounded-md bg-status-cancelled-bg px-3 py-2 text-xs font-medium text-status-cancelled">
              {error}
            </p>
          )}
        </div>

        <div className="flex gap-2 border-t border-border px-5 py-4">
          <Button variant="secondary" className="flex-1" onClick={onClose}>
            Annuler
          </Button>
          <Button className="flex-1" disabled={loading || !canConvert} onClick={convert}>
            <ShoppingBag className="h-3.5 w-3.5" />
            {loading ? "Creation..." : "Creer la commande"}
          </Button>
        </div>
      </div>
    </div>
  );
}