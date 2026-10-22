
"use client";

import { useEffect, useRef, useState } from "react";

export default function QRScanner({ onScan, disabled = false }) {
  const scannerRef = useRef(null);
  const onScanRef = useRef(onScan);
  const [active, setActive] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  useEffect(() => {
    if (!active || disabled) return;

    let cancelled = false;
    let scanner = null;
    let handled = false;

    async function startScanner() {
      setStarting(true);
      setCameraError("");

      try {
        const { Html5Qrcode } = await import("html5-qrcode");

        if (cancelled) return;

        scanner = new Html5Qrcode("organizer-qr-reader");
        scannerRef.current = scanner;

        await scanner.start(
          { facingMode: "environment" },
          {
            fps: 10,
            qrbox: { width: 240, height: 240 },
            aspectRatio: 1,
          },
          async (decodedText) => {
            if (handled || cancelled) return;
            handled = true;

            try {
              await scanner.stop();
            } catch {}

            if (!cancelled) {
              setActive(false);
              onScanRef.current(decodedText);
            }
          },
          () => {
            // Ignore frames that do not contain a readable QR code.
          }
        );
      } catch (error) {
        if (!cancelled) {
          setCameraError(
            error?.message ||
              "Unable to start the camera. Check camera permissions."
          );
          setActive(false);
        }
      } finally {
        if (!cancelled) setStarting(false);
      }
    }

    startScanner();

    return () => {
      cancelled = true;

      const current = scannerRef.current;
      scannerRef.current = null;

      if (current) {
        current
          .stop()
          .catch(() => {})
          .finally(() => current.clear().catch(() => {}));
      }
    };
  }, [active, disabled]);

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-xl border border-[#6d572d] bg-black">
        <div id="organizer-qr-reader" />

        {!active && (
          <div className="flex min-h-40 flex-col items-center justify-center gap-3 p-5 text-center">
            <span className="text-4xl text-[#d6b66b]">▦</span>
            <p className="text-sm text-stone-300">
              Point your camera at the attendee&apos;s ticket QR code.
            </p>
          </div>
        )}
      </div>

      {cameraError && (
        <p role="alert" className="text-sm text-red-300">
          {cameraError}
        </p>
      )}

      <button
        type="button"
        disabled={disabled || starting}
        onClick={() => {
          setCameraError("");
          setActive((value) => !value);
        }}
        className="w-full rounded-lg border border-[#d6b66b] px-4 py-3 font-semibold text-[#e6cc8c] transition hover:bg-[#d6b66b]/10 disabled:opacity-50"
      >
        {starting
          ? "Starting camera..."
          : active
            ? "Stop camera"
            : "Open QR scanner"}
      </button>

      <p className="text-xs leading-5 text-stone-500">
        Camera access is requested by your browser. You can also use manual
        token entry if the camera is unavailable.
      </p>
    </div>
  );
}
