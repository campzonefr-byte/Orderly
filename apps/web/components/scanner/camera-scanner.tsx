"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Camera, CameraOff } from "lucide-react";

export function CameraScanner({
  onScan,
  active,
  onToggle,
}: {
  onScan: (code: string) => void;
  active: boolean;
  onToggle: (v: boolean) => void;
}) {
  const containerId = "camera-scanner-view";
  const scannerRef = useRef<any>(null);
  const [error, setError] = useState("");
  const lastScanRef = useRef<{ code: string; at: number }>({ code: "", at: 0 });

  useEffect(() => {
    if (!active) {
      if (scannerRef.current) {
        scannerRef.current.stop().catch(() => {});
        scannerRef.current = null;
      }
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const mod = await import("html5-qrcode");
        if (cancelled) return;

        const scanner = new mod.Html5Qrcode(containerId);
        scannerRef.current = scanner;

        await scanner.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 260, height: 160 } },
          (decoded: string) => {
            const now = Date.now();
            // Debounce: same code within 2.5s is ignored
            if (
              lastScanRef.current.code === decoded &&
              now - lastScanRef.current.at < 2500
            ) {
              return;
            }
            lastScanRef.current = { code: decoded, at: now };
            onScan(decoded);
          },
          () => {}
        );
        setError("");
      } catch (e: any) {
        setError(e?.message ?? "Impossible d'acceder a la camera");
        onToggle(false);
      }
    })();

    return () => {
      cancelled = true;
      if (scannerRef.current) {
        scannerRef.current.stop().catch(() => {});
        scannerRef.current = null;
      }
    };
  }, [active, onScan, onToggle]);

  return (
    <div className="space-y-2">
      <Button
        variant={active ? "destructive" : "secondary"}
        className="w-full"
        onClick={() => onToggle(!active)}
      >
        {active ? (
          <>
            <CameraOff className="h-3.5 w-3.5" />
            Arreter la camera
          </>
        ) : (
          <>
            <Camera className="h-3.5 w-3.5" />
            Activer la camera
          </>
        )}
      </Button>

      <div
        id={containerId}
        className={active ? "overflow-hidden rounded-xl border border-border" : "hidden"}
      />

      {error && (
        <p className="rounded-md bg-status-cancelled-bg px-3 py-2 text-xs text-status-cancelled">
          {error}
        </p>
      )}
    </div>
  );
}