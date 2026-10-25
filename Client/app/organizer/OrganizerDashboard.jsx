
"use client";

import { useCallback, useEffect, useState } from "react";

const GOLD = "#c9a227";

const initialStats = {
  ticketsSold: 0,
  inside: 0,
  outside: 0,
  totalMovements: 0,
};

function formatTime(value) {
  if (!value) return "—";

  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(value));
}

function StatCard({ label, value, detail, accent }) {
  return (
    <div
      style={{
        background: "#21191d",
        border: "1px solid #443238",
        borderTop: `3px solid ${accent || GOLD}`,
        borderRadius: 14,
        padding: "20px",
        minWidth: 0,
      }}
    >
      <div style={{ color: "#c7b9bd", fontSize: 13, marginBottom: 12 }}>
        {label}
      </div>

      <div
        style={{
          color: "#fff8e9",
          fontSize: "clamp(28px, 4vw, 38px)",
          fontWeight: 750,
          lineHeight: 1.1,
          overflowWrap: "anywhere",
        }}
      >
        {value.toLocaleString("en-IN")}
      </div>

      <div style={{ color: "#a99ba0", fontSize: 12, marginTop: 10 }}>
        {detail}
      </div>
    </div>
  );
}

export default function OrganizerDashboard({showId}) {
  const [stats, setStats] = useState(initialStats);
  const [activity, setActivity] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [updatedAt, setUpdatedAt] = useState(null);
  const [bookingId, setBookingId] = useState("");
  const [downloadingPDF, setDownloadingPDF] = useState(false);
  const [pdfError, setPdfError] = useState("");
  const [pdfSuccess, setPdfSuccess] = useState("");

  const loadDashboard = useCallback(async (manual = false) => {
    if (manual) setRefreshing(true);

    try {
      const response = await fetch(`/api/organizer/dashboard?showId=${encodeURIComponent(showId)}`, {
        method: "GET",
        cache: "no-store",
        credentials: "same-origin",
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        if (response.status === 401) {
          throw new Error("Your session may have expired. Please log in again.");
        }

        throw new Error(result.error || "Could not load the dashboard.");
      }

      setStats(result.stats);
      setActivity(result.recentActivity || []);
      setUpdatedAt(result.updatedAt);
      setError("");
    } catch (err) {
      setError(err.message || "Could not connect to the dashboard.");

      // Keep the last successful data visible if a refresh fails.
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [showId]);

  useEffect(() => {
    loadDashboard();

    const intervalId = setInterval(() => {
      loadDashboard();
    }, 10000);

    return () => clearInterval(intervalId);
  }, [loadDashboard]);

    const downloadBookingPDF = async () => {
    const id = bookingId.trim();

    if (!id) {
      setPdfError("Please enter a booking ID.");
      return;
    }

    setDownloadingPDF(true);
    setPdfError("");
    setPdfSuccess("");

    try {
      const params = new URLSearchParams({
        bookingId: id,
        showId: String(showId),
      });

      const response = await fetch(
        `/api/organizer/booking-pdf?${params.toString()}`,
        {
          method: "GET",
          cache: "no-store",
          credentials: "same-origin",
        }
      );

      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        throw new Error(
          result.error || "Could not download tickets for this booking."
        );
      }

      const blob = await response.blob();

      if (blob.type !== "application/pdf") {
        throw new Error("The server did not return a valid PDF.");
      }

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");

      link.href = url;
      link.download = `THESPIAN-TICKETS-${id}.pdf`;

      document.body.appendChild(link);
      link.click();
      link.remove();

      URL.revokeObjectURL(url);
      setPdfSuccess("Your booking PDF download has started.");
    } catch (err) {
      setPdfError(err.message || "PDF download failed.");
    } finally {
      setDownloadingPDF(false);
    }
  };

  return (
    <section
      style={{
        width: "100%",
        color: "#fff8e9",
        display: "grid",
        gap: 22,
      }}
    >
      <style jsx>{`
        .dashboard-grid {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 14px;
        }

        .activity-row {
          display: grid;
          grid-template-columns: minmax(100px, 1.2fr) minmax(70px, 0.7fr)
            minmax(100px, 1fr) minmax(100px, 1fr);
          gap: 12px;
          align-items: center;
          padding: 14px 16px;
          border-top: 1px solid #382a30;
          font-size: 13px;
        }

        .muted {
          color: #b8a9ae;
        }

        @media (max-width: 800px) {
          .dashboard-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 10px;
          }

          .activity-row {
            grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
            gap: 8px;
            padding: 14px 12px;
          }
        }
      `}</style>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 14,
        }}
      >
        <div>
          <div
            style={{
              color: GOLD,
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: 2,
              marginBottom: 7,
            }}
          >
            EVENT CONTROL
          </div>

          <h2 style={{ fontSize: 24, margin: 0, fontWeight: 750 }}>
            Attendance overview
          </h2>

          <p
            style={{
              color: "#b8a9ae",
              fontSize: 13,
              margin: "7px 0 0",
            }}
          >
            Live ticket and entry activity
          </p>
        </div>

        <button
          type="button"
          onClick={() => loadDashboard(true)}
          disabled={refreshing}
          style={{
            border: "1px solid #65502b",
            background: "#2a2021",
            color: "#f6d778",
            padding: "11px 15px",
            borderRadius: 10,
            cursor: refreshing ? "wait" : "pointer",
            fontWeight: 650,
            opacity: refreshing ? 0.7 : 1,
          }}
        >
          {refreshing ? "Refreshing…" : "↻ Refresh"}
        </button>
      </div>

      {error && (
        <div
          role="alert"
          style={{
            background: "#381d24",
            color: "#ffd0d0",
            border: "1px solid #793d47",
            borderRadius: 10,
            padding: 13,
            fontSize: 13,
          }}
        >
          {error}
        </div>
      )}

      <div className="dashboard-grid">
        <StatCard
          label="Tickets sold"
          value={stats.ticketsSold}
          detail="Confirmed paid tickets"
        />

        <StatCard
          label="Currently inside"
          value={stats.inside}
          detail="Latest status: check-in"
          accent="#49c58a"
        />

        <StatCard
          label="Currently outside"
          value={stats.outside}
          detail="Includes attendees not yet entered"
          accent="#e5a84b"
        />

        <StatCard
          label="Total movements"
          value={stats.totalMovements}
          detail="Recorded check-ins + check-outs"
          accent="#9c8be8"
        />
      </div>

      <div
  style={{
    background: "#21191d",
    border: "1px solid #443238",
    borderRadius: 14,
    padding: 20,
    display: "grid",
    gap: 14,
  }}
>
  <div>
    <div
      style={{
        color: GOLD,
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: 2,
        marginBottom: 7,
      }}
    >
      BOOKING MANAGEMENT
    </div>

    <h3 style={{ fontSize: 18, margin: 0 }}>
      Download booking tickets
    </h3>

    <p
      style={{
        color: "#b8a9ae",
        fontSize: 13,
        lineHeight: 1.6,
        margin: "8px 0 0",
      }}
    >
      Enter the booking ID to download all tickets associated
      with that booking as a PDF.
    </p>
  </div>

  <input
    type="text"
    value={bookingId}
    onChange={(e) => {
      setBookingId(e.target.value);
      setPdfError("");
      setPdfSuccess("");
    }}
    placeholder="Paste booking UUID here"
    autoComplete="off"
    spellCheck={false}
    style={{
      width: "100%",
      boxSizing: "border-box",
      background: "#191316",
      color: "#fff8e9",
      border: "1px solid #65502b",
      borderRadius: 9,
      padding: "13px 12px",
      fontSize: 14,
      outlineColor: GOLD,
    }}
  />

  <button
    type="button"
    onClick={downloadBookingPDF}
    disabled={downloadingPDF || !bookingId.trim()}
    style={{
      background: downloadingPDF ? "#51452b" : GOLD,
      color: "#191316",
      border: "none",
      borderRadius: 9,
      padding: "13px 16px",
      fontWeight: 750,
      fontSize: 14,
      cursor: downloadingPDF ? "wait" : "pointer",
      opacity: downloadingPDF || !bookingId.trim() ? 0.65 : 1,
    }}
  >
    {downloadingPDF ? "Preparing PDF…" : "↓ Download booking PDF"}
  </button>

  {pdfError && (
    <p
      role="alert"
      style={{ color: "#ffaaaa", fontSize: 13, margin: 0 }}
    >
      {pdfError}
    </p>
  )}

  {pdfSuccess && (
    <p
      role="status"
      style={{ color: "#65d69b", fontSize: 13, margin: 0 }}
    >
      {pdfSuccess}
    </p>
  )}
</div>

      <div
        style={{
          background: "#21191d",
          border: "1px solid #443238",
          borderRadius: 14,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            padding: "18px 16px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 8,
          }}
        >
          <h3 style={{ fontSize: 17, margin: 0 }}>Recent ticket activity</h3>

          <span style={{ color: "#b8a9ae", fontSize: 11 }}>
            {updatedAt ? `Updated ${formatTime(updatedAt)}` : "Connecting…"}
          </span>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              "minmax(100px, 1.2fr) minmax(70px, 0.7fr) minmax(100px, 1fr) minmax(100px, 1fr)",
            gap: 12,
            padding: "11px 16px",
            background: "#191316",
            color: "#b8a9ae",
            fontSize: 11,
          }}
          className="activity-heading"
        >
          <span>Ticket / seat</span>
          <span>Action</span>
          <span>Staff role</span>
          <span>Time</span>
        </div>

        {loading ? (
          <p style={{ padding: 18, color: "#b8a9ae", fontSize: 13 }}>
            Loading attendance data…
          </p>
        ) : activity.length === 0 ? (
          <p style={{ padding: 18, color: "#b8a9ae", fontSize: 13 }}>
            No ticket movements recorded yet.
          </p>
        ) : (
          activity.map((item) => (
            <div key={item.id} className="activity-row">
              <div>
                <div style={{ fontWeight: 700, overflowWrap: "anywhere" }}>
                  {item.ticketCode || "Ticket"}
                </div>
                <div className="muted" style={{ marginTop: 4 }}>
                  Seat {item.seatId || "—"}
                </div>
              </div>

              <div
                style={{
                  color: item.action === "check-in" ? "#65d69b" : "#f1bd69",
                  fontWeight: 700,
                }}
              >
                {item.action === "check-in" ? "✓ Check-in" : "↗ Check-out"}
              </div>

              <div className="muted" style={{ overflowWrap: "anywhere" }}>
                {String(item.staffRole || "staff")
                  .replaceAll("_", " ")
                  .replace(/\b\w/g, (letter) => letter.toUpperCase())}
              </div>

              <div className="muted">{formatTime(item.scannedAt)}</div>
            </div>
          ))
        )}
      </div>

      <p style={{ color: "#a99ba0", fontSize: 11, margin: 0 }}>
        {loading
          ? "Connecting to Supabase…"
          : "Data refreshes automatically every 10 seconds. If a refresh fails, the last successful data stays visible."}
      </p>
    </section>
  );
}
