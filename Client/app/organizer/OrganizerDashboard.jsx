
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
