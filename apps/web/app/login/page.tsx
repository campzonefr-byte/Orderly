"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";


export default function LoginPage() {
  const { login, user } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("admin@orderly.app");
  const [password, setPassword] = useState("admin123");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user) router.push("/confirmation");
  }, [user]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const result = await login(email, password);
    if (!result.ok) {
      setError(result.error ?? "Login failed.");
      return;
    }
    router.push("/confirmation");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary text-lg font-bold text-primary-foreground">
            O
          </div>
          <h1 className="mt-3 text-lg font-semibold">Sign in to Orderly</h1>
          <p className="mt-1 text-sm text-muted">Manage orders across all your stores</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-lg border border-border bg-surface p-6 shadow-sm"
        >
          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted">Email</label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                required
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted">Password</label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
            </div>

            {error && (
              <p className="rounded-md bg-status-cancelled-bg px-3 py-2 text-xs font-medium text-status-cancelled">
                {error}
              </p>
            )}

            <Button type="submit" className="w-full">
              Sign in
            </Button>
          </div>
        </form>

        <div className="mt-5 rounded-md border border-border bg-surface-sunken p-3 text-xs text-muted">
          <p className="font-medium text-foreground">Demo accounts</p>
          <p className="mt-1">admin@orderly.app / admin123 — Super Admin</p>
          <p>sara@orderly.app / manager123 — Store Manager</p>
          <p>nadia@orderly.app / staff123 — Staff</p>
        </div>
      </div>
    </div>
  );
}