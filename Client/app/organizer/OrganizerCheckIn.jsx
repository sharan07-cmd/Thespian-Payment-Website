
"use client";

import { useCallback, useRef, useState } from "react";
import QRScanner from "./QRScanner";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function extractToken(value) {
  const text = String(value ?? "").trim();

  try {
    const url = new URL(text);
    const token = url.searchParams.get("token");

    if (token) return token.trim();
  } catch {
    // The QR code may contain a raw UUID.
  }

  return text;
}

export default function OrganizerCheckIn({showId}) {
  const [manualToken, setManualToken] = useState("");
  const [action, setAction] = useState("check-in");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [scanSession, setScanSession] = useState(0);

  const requestInProgress = useRef(false);

  const verifyToken = useCallback(async (rawValue) => {
    if (requestInProgress.current) return;

    const token = extractToken(rawValue);

    if (!UUID_RE.test(token)) {
      setResult(null);
      setError("Invalid QR code. No valid ticket token was found.");
      return;
    }

    requestInProgress.current = true;
    setLoading(true);
    setResult(null);
    setError("");

    console.log("Ticket scan request:", {
      token,
      action,
      showId,
    });

    try {
      const response = await fetch("/api/organizer/check-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, action, showId }),
      });

      let data;

      try {
        data = await response.json();
      } catch {
        throw new Error("The server returned an unreadable response.");
      }

      if (!response.ok || !data?.success) {
        setError(data?.error || "Ticket movement failed.");
        return;
      }

      setResult(data);
      setManualToken("");
    } catch (err) {
      setError(
        err?.message === "Failed to fetch"
          ? "Connection interrupted. Check the network and verify the ticket status before retrying."
          : err?.message || "Unable to reach the server."
      );
    } finally {
      requestInProgress.current = false;
      setLoading(false);
    }
  }, [action]);

  const ticket = result?.ticket;

  function scanNextTicket() {
    setResult(null);
    setError("");
    setManualToken("");
    setScanSession((value) => value + 1);
  }

  function changeAction(nextAction) {
    if (loading) return;

    setAction(nextAction);
    setResult(null);
    setError("");
    setScanSession((value) => value + 1);
  }

  const isCheckIn = result?.action === "check-in";

  return (
    <section className="rounded-2xl border border-[#574629] bg-[#171612] p-5 sm:p-7">
      <div className="mb-6">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#d6b66b]">
          Entry management
        </p>
        <h2 className="mt-1 text-xl font-semibold text-white">
          Ticket verification
        </h2>

        <p className="mt-1 text-sm text-stone-400">
          Selected show:{" "}
          <span className="font-semibold text-[#d6b66b]">
            {showId === "show-1"
              ? "Wednesday, 28 October 2026 — 6:00 PM"
              : showId === "show-2"
                ? "Thursday, 29 October 2026 — 6:00 PM"
                : "Unknown show"}
          </span>
        </p>

        <p className="mt-1 text-sm text-stone-400">
          Scan the same ticket at entry, during interval exit, and re-entry.
        </p>
      </div>

      <div className="mb-5">
        <p className="mb-2 text-sm font-semibold text-stone-200">
          Select scanning mode
        </p>

        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            disabled={loading}
            onClick={() => changeAction("check-in")}
            aria-pressed={action === "check-in"}
            className={`rounded-xl border px-3 py-4 text-sm font-bold transition ${
              action === "check-in"
                ? "border-emerald-500 bg-emerald-950/50 text-emerald-200"
                : "border-stone-700 text-stone-400 hover:border-stone-500"
            } disabled:opacity-50`}
          >
            ✓ CHECK-IN
            <span className="mt-1 block text-xs font-normal">
              Admit attendee
            </span>
          </button>

          <button
            type="button"
            disabled={loading}
            onClick={() => changeAction("check-out")}
            aria-pressed={action === "check-out"}
            className={`rounded-xl border px-3 py-4 text-sm font-bold transition ${
              action === "check-out"
                ? "border-amber-500 bg-amber-950/40 text-amber-200"
                : "border-stone-700 text-stone-400 hover:border-stone-500"
            } disabled:opacity-50`}
          >
            ↗ CHECK-OUT
            <span className="mt-1 block text-xs font-normal">
              Record exit
            </span>
          </button>
        </div>

        <p className="mt-3 text-xs text-stone-400">
          Current mode:{" "}
          <span className="font-bold text-[#d6b66b]">
            {action === "check-in" ? "CHECK-IN" : "CHECK-OUT"}
          </span>
        </p>
      </div>

      <QRScanner
        onScan={verifyToken}
        disabled={loading}
        restartKey={scanSession}
      />

      {loading && (
        <div role="status" className="mt-4 rounded-lg bg-stone-900 p-4 text-sm text-stone-200">
          Verifying ticket and recording movement…
        </div>
      )}

      <div className="my-5 flex items-center gap-3 text-xs uppercase tracking-widest text-stone-500">
        <div className="h-px flex-1 bg-stone-800" />
        OR ENTER TOKEN
        <div className="h-px flex-1 bg-stone-800" />
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          verifyToken(manualToken);
        }}
        className="flex flex-col gap-3 sm:flex-row"
      >
        <input
          value={manualToken}
          onChange={(event) => setManualToken(event.target.value)}
          placeholder="Paste ticket token or QR URL"
          aria-label="Ticket token or QR URL"
          autoComplete="off"
          className="min-w-0 flex-1 rounded-lg border border-stone-700 bg-[#0f0f0e] px-4 py-3 text-sm text-white outline-none focus:border-[#d6b66b]"
        />

        <button
          type="submit"
          disabled={loading || !manualToken.trim()}
          className="rounded-lg bg-[#d6b66b] px-5 py-3 font-bold text-[#17130a] hover:bg-[#e6cb8a] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? "Verifying..." : "Verify ticket"}
        </button>
      </form>

      {error && (
        <div
          role="alert"
          className="mt-5 rounded-xl border border-red-900 bg-red-950/40 p-4 text-sm text-red-200"
        >
          <p className="font-bold">Movement unsuccessful</p>
          <p className="mt-1">{error}</p>

          {error.toLowerCase().includes("log in") && (
            <a className="mt-3 inline-block underline" href="/organizer/login">
              Go to organiser login
            </a>
          )}
        </div>
      )}

      {result?.success && ticket && (
        <div
          role="status"
          className={`mt-5 rounded-xl border p-5 ${
            isCheckIn
              ? "border-emerald-800 bg-emerald-950/30"
              : "border-amber-800 bg-amber-950/30"
          }`}
        >
          <p
            className={`font-bold ${
              isCheckIn ? "text-emerald-300" : "text-amber-200"
            }`}
          >
            {isCheckIn ? "✓ CHECK-IN SUCCESSFUL" : "✓ CHECK-OUT SUCCESSFUL"}
          </p>

          <p className="mt-1 text-sm text-stone-200">
            {result.message}
          </p>

          <dl className="mt-4 divide-y divide-stone-800 text-sm">
            <div className="flex justify-between gap-4 py-3">
              <dt className="text-stone-400">Ticket code</dt>
              <dd className="break-all text-right font-semibold text-white">
                {ticket.ticketCode ?? "N/A"}
              </dd>
            </div>

            <div className="flex justify-between gap-4 py-3">
              <dt className="text-stone-400">Seat</dt>
              <dd className="text-right font-semibold text-white">
                {ticket.seatId ?? "N/A"}
              </dd>
            </div>

            <div className="flex justify-between gap-4 py-3">
              <dt className="text-stone-400">Current status</dt>
              <dd className="text-right font-bold text-[#d6b66b]">
                {ticket.entryStatus ?? result.entryStatus ?? "N/A"}
              </dd>
            </div>

            <div className="flex justify-between gap-4 py-3">
              <dt className="text-stone-400">Movement time</dt>
              <dd className="text-right text-white">
                {ticket.movementAt
                  ? new Date(ticket.movementAt).toLocaleString()
                  : "Just now"}
              </dd>
            </div>
          </dl>

          <button
            type="button"
            onClick={scanNextTicket}
            className="mt-4 w-full rounded-lg border border-stone-700 px-4 py-3 font-semibold text-white hover:bg-stone-900"
          >
            Scan Next Ticket
          </button>
        </div>
      )}
    </section>
  );
}
