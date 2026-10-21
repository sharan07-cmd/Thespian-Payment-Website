
"use client";

import { useEffect, useState } from "react";

export default function OrganizerScanPage() {
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [pageError, setPageError] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const qrToken = params.get("token") || "";

    if (!/^[0-9a-f-]{36}$/i.test(qrToken)) {
      setPageError("Invalid or missing ticket QR code.");
      return;
    }

    setToken(qrToken);
  }, []);

  async function verifyAndCheckIn() {
    if (!token || loading) return;

    setLoading(true);
    setResult(null);
    setPageError("");

    try {
      const response = await fetch("/api/organizer/check-in", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ token }),
      });

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 401) {
          setPageError(
            "Please log in to your organiser account before checking in tickets."
          );
        } else if (response.status === 403) {
          setPageError(
            "Your account is not authorised to check in tickets."
          );
        } else {
          setPageError(
            data.error || "Ticket verification failed."
          );
        }

        return;
      }

      setResult(data);
    } catch (error) {
      console.error("Ticket check-in failed:", error);
      setPageError(
        "Unable to contact the server. Please try again."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="scanPage">
      <section className="scanCard">
        <p className="eyebrow">THESPIAN TICKETS</p>

        <div className="brandIcon">
          {result?.success ? "✓" : "◇"}
        </div>

        <h1>
          {result?.success
            ? "Check-in Successful"
            : "Ticket Verification"}
        </h1>

        <p className="subtitle">
          {result?.success
            ? "This ticket has been verified and checked in."
            : "Verify the attendee's ticket before allowing entry."}
        </p>

        {token && (
          <div className="tokenBox">
            <span>QR CODE STATUS</span>
            <strong>Ticket code detected</strong>
          </div>
        )}

        {pageError && (
          <div className="message error" role="alert">
            <strong>Verification failed</strong>
            <p>{pageError}</p>

            {pageError.includes("log in") && (
              <a href="/organizer/login">
                Go to organiser login
              </a>
            )}
          </div>
        )}

        {result?.success && result.ticket && (
          <div className="ticketDetails">
            <div className="status">
              <span className="statusDot" />
              CHECKED IN
            </div>

            <div className="detailRow">
              <span>Ticket code</span>
              <strong>{result.ticket.ticketCode || "N/A"}</strong>
            </div>

            <div className="detailRow">
              <span>Seat</span>
              <strong>{result.ticket.seatId || "N/A"}</strong>
            </div>

            <div className="detailRow">
              <span>Checked in at</span>
              <strong>
                {result.ticket.checkedInAt
                  ? new Date(
                      result.ticket.checkedInAt
                    ).toLocaleString()
                  : "Just now"}
              </strong>
            </div>
          </div>
        )}

        {!result?.success && (
          <button
            type="button"
            className="verifyButton"
            onClick={verifyAndCheckIn}
            disabled={!token || loading || Boolean(pageError)}
          >
            {loading
              ? "Verifying ticket..."
              : "Verify & Check In"}
          </button>
        )}

        <a className="backLink" href="/organizer">
          Back to organiser dashboard
        </a>

        <p className="footer">
          Secure entry management · THESPIAN TICKETS
        </p>
      </section>

      <style jsx>{`
        .scanPage {
          min-height: 100vh;
          box-sizing: border-box;
          padding: 28px 16px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #100e0a;
          color: #fff8e8;
        }

        .scanCard {
          width: 100%;
          max-width: 440px;
          box-sizing: border-box;
          padding: 30px 24px;
          border: 1px solid rgba(218, 178, 76, 0.4);
          border-radius: 18px;
          background: #19160f;
          box-shadow: 0 20px 70px rgba(0, 0, 0, 0.35);
          text-align: center;
        }

        .eyebrow {
          margin: 0;
          color: #dab24c;
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.22em;
        }

        .brandIcon {
          display: grid;
          place-items: center;
          width: 60px;
          height: 60px;
          margin: 22px auto 16px;
          border: 1px solid #dab24c;
          border-radius: 50%;
          color: #ffe291;
          font-size: 34px;
        }

        h1 {
          margin: 0 0 10px;
          font-size: clamp(24px, 6vw, 30px);
          line-height: 1.2;
        }

        .subtitle {
          margin: 0 auto 24px;
          color: #c0b597;
          font-size: 14px;
          line-height: 1.6;
        }

        .tokenBox {
          display: flex;
          flex-direction: column;
          gap: 7px;
          margin-bottom: 20px;
          padding: 14px;
          border: 1px solid rgba(218, 178, 76, 0.25);
          border-radius: 10px;
          background: rgba(218, 178, 76, 0.05);
        }

        .tokenBox span {
          color: #c0b597;
          font-size: 10px;
          letter-spacing: 0.12em;
        }

        .tokenBox strong {
          color: #ffe291;
          font-size: 14px;
        }

        .verifyButton {
          width: 100%;
          min-height: 49px;
          padding: 13px 16px;
          border: 0;
          border-radius: 9px;
          background: #dab24c;
          color: #171108;
          font-size: 14px;
          font-weight: 800;
          cursor: pointer;
        }

        .verifyButton:disabled {
          cursor: not-allowed;
          opacity: 0.55;
        }

        .message {
          margin: 18px 0;
          padding: 15px;
          border-radius: 10px;
          text-align: left;
          overflow-wrap: anywhere;
        }

        .error {
          border: 1px solid rgba(255, 130, 130, 0.35);
          background: rgba(180, 40, 40, 0.12);
          color: #ffb1a8;
        }

        .message p {
          margin: 8px 0;
          font-size: 13px;
          line-height: 1.6;
        }

        .message a {
          color: #ffe291;
          font-weight: 700;
        }

        .ticketDetails {
          margin: 20px 0;
          padding: 17px;
          border: 1px solid rgba(218, 178, 76, 0.3);
          border-radius: 12px;
          text-align: left;
        }

        .status {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          margin-bottom: 16px;
          color: #ffe291;
          font-size: 12px;
          font-weight: 800;
          letter-spacing: 0.1em;
        }

        .statusDot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #64d69a;
        }

        .detailRow {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 12px;
          padding: 12px 0;
          border-top: 1px solid rgba(218, 178, 76, 0.16);
          font-size: 13px;
        }

        .detailRow span {
          flex-shrink: 0;
          color: #c0b597;
        }

        .detailRow strong {
          text-align: right;
          overflow-wrap: anywhere;
        }

        .backLink {
          display: inline-block;
          margin-top: 22px;
          color: #ffe291;
          font-size: 13px;
          text-decoration: none;
        }

        .footer {
          margin: 28px 0 0;
          color: #93886f;
          font-size: 10px;
          line-height: 1.5;
        }

        @media (max-width: 380px) {
          .scanCard {
            padding: 25px 17px;
          }
        }
      `}</style>
    </main>
  );
}