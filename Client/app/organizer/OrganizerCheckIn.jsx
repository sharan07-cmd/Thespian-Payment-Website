
"use client";

import { useCallback, useState } from "react";
import QRScanner from "./QRScanner";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function extractToken(value) {
  const text = value.trim();

  // QR codes may contain the token directly or a URL containing ?token=...
  try {
    const url = new URL(text);
    const token = url.searchParams.get("token");
    if (token) return token.trim();
  } catch {
    // The QR contents may be a raw UUID rather than a URL.
  }

  return text;
}

export default function OrganizerCheckIn() {
  const [manualToken, setManualToken] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  const verifyToken = useCallback(async (rawValue) => {
    const token = extractToken(rawValue);

    if (!UUID_RE.test(token)) {
      setResult(null);
      setError("Invalid QR code. No valid ticket token was found.");
      return;
    }

    if (loading) return;

    setLoading(true);
    setResult(null);
    setError("");

    try {
      const response = await fetch("/api/organizer/check-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Ticket verification failed.");
        return;
      }

      setResult(data);
      setManualToken("");
    } catch {
      setError("Unable to reach the server. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [loading]);

  const ticket = result?.ticket;

  return (
    <section className="rounded-2xl border border-[#574629] bg-[#171612] p-5 sm:p-7">
      <div className="mb-6 flex items-start gap-3">
        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-[#d6b66b]/10 text-2xl text-[#d6b66b]">
          ▦
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#d6b66b]">
            Entry management
          </p>
          <h2 className="mt-1 text-xl font-semibold text-white">
            Ticket verification
          </h2>
          <p className="mt-1 text-sm text-stone-400">
            Scan a ticket and verify it before admitting the attendee.
          </p>
        </div>
      </div>

      <QRScanner onScan={verifyToken} disabled={loading} />

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
          <p className="font-bold">Verification unsuccessful</p>
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
          className="mt-5 rounded-xl border border-emerald-800 bg-emerald-950/30 p-5"
        >
          <p className="font-bold text-emerald-300">
            ✓ Check-in successful
          </p>
          <p className="mt-1 text-sm text-emerald-100/80">
            {result.message}
          </p>

          <dl className="mt-4 divide-y divide-emerald-900/70 text-sm">
            <div className="flex justify-between gap-4 py-3">
              <dt className="text-stone-400">Ticket code</dt>
              <dd className="break-all text-right font-semibold text-white">
                {ticket.ticketCode || "N/A"}
              </dd>
            </div>
            <div className="flex justify-between gap-4 py-3">
              <dt className="text-stone-400">Seat</dt>
              <dd className="text-right font-semibold text-white">
                {ticket.seatId || "N/A"}
              </dd>
            </div>
            <div className="flex justify-between gap-4 py-3">
              <dt className="text-stone-400">Checked in at</dt>
              <dd className="text-right text-white">
                {ticket.checkedInAt
                  ? new Date(ticket.checkedInAt).toLocaleString()
                  : "Just now"}
              </dd>
            </div>
          </dl>

          <button
            type="button"
            onClick={() => {
              setResult(null);
              setError("");
            }}
            className="mt-4 w-full rounded-lg border border-emerald-800 px-4 py-3 font-semibold text-emerald-200 hover:bg-emerald-900/30"
          >
            Scan next ticket
          </button>
        </div>
      )}
    </section>
  );
}
