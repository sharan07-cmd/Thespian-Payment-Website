
"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export default function QRScanner({
  onScan,
  disabled = false,
  restartKey = 0,
}) {
  const scannerRef = useRef(null);
  const onScanRef = useRef(onScan);
  const handledRef = useRef(false);

  const [active, setActive] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  // Let the parent request a fresh scan without reloading the page.
  useEffect(() => {
    if (restartKey > 0) {
      handledRef.current = false;
      setCameraError("");
      setActive(true);
    }
  }, [restartKey]);

  const stopScanner = useCallback(async (scanner) => {
    if (!scanner) return;

    try {
      if (scanner.isScanning) {
        await scanner.stop();
      }
    } catch {
      // The camera may already have stopped.
    }

    try {
      scanner.clear();
    } catch {
      // The reader may already have been cleared.
    }

    if (scannerRef.current === scanner) {
      scannerRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!active || disabled) return;

    let cancelled = false;
    let scanner = null;
    let startPromise = null;

    async function startScanner() {
      setStarting(true);
      setCameraError("");
      handledRef.current = false;

      try {
        const { Html5Qrcode } = await import("html5-qrcode");

        if (cancelled) return;

        scanner = new Html5Qrcode("organizer-qr-reader");
        scannerRef.current = scanner;

        startPromise = scanner.start(
          { facingMode: "environment" },
          {
            fps: 10,
            qrbox: { width: 220, height: 220 },
            aspectRatio: 1,
          },
          (decodedText) => {
            if (cancelled || handledRef.current) return;

            // Lock immediately, before React state or network requests.
            handledRef.current = true;
            setActive(false);

            // The effect cleanup stops the camera.
            onScanRef.current(decodedText);
          },
          () => {
            // Ignore frames without a readable QR code.
          }
        );

        await startPromise;

        if (cancelled) {
          await stopScanner(scanner);
        }
      } catch (error) {
        if (!cancelled) {
          setCameraError(
            error?.message ||
              "Unable to start the camera. Check browser camera permissions."
          );
          setActive(false);
        }

        if (scanner) {
          await stopScanner(scanner);
        }
      } finally {
        if (!cancelled) {
          setStarting(false);
        }
      }
    }

    startScanner();

    return () => {
      cancelled = true;

      const current = scanner;

      if (current) {
        // Wait for startup to finish before stopping or clearing the reader.
        void (async () => {
          try {
            if (startPromise) await startPromise;
          } catch {
            // Startup may have failed or been interrupted.
          }

          await stopScanner(current);
        })();
      }
    };
  }, [active, disabled, stopScanner]);

  function toggleScanner() {
    setCameraError("");

    if (active) {
      setActive(false);
    } else {
      handledRef.current = false;
      setActive(true);
    }
  }

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
        onClick={toggleScanner}
        className="w-full rounded-lg border border-[#d6b66b] px-4 py-3 font-semibold text-[#e6cc8c] transition hover:bg-[#d6b66b]/10 disabled:opacity-50"
      >
        {starting
          ? "Starting camera..."
          : active
            ? "Stop camera"
            : "Open QR scanner"}
      </button>

      <p className="text-xs leading-5 text-stone-500">
        Allow camera access in your browser. If scanning is unavailable,
        enter the ticket token manually.
      </p>
    </div>
  );
}
