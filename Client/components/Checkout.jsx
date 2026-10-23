
  "use client";

  import { useEffect, useState } from "react";

  export default function Checkout({
    reservation,
    seats,
    showTitle,
    showSubtitle,
    onBack,
    onContinue,
    paymentMessage,
  }) {
    const amount = Number(reservation.total_paise) / 100;
    const expiresAt = new Date(reservation.expires_at);

    const [processingPayment, setProcessingPayment] = useState(false);
    const [paymentWindowOpen, setPaymentWindowOpen] = useState(false);
    const [localPaymentMessage, setLocalPaymentMessage] = useState("");

      
    async function releaseReservation() {
      if (!reservation?.booking_id || !reservation?.release_token) {
        return;
      }

      try {
        const response = await fetch("/api/seats", {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            bookingId: reservation.booking_id,
            releaseToken: reservation.release_token,
          }),
          keepalive: true,
        });

        if (!response.ok) {
          console.error("Could not release reservation.");
        }
      } catch (error) {
        console.error("Reservation release request failed:", error);
      }
    }

    function handleBack() {
      if (processingPayment && paymentWindowOpen) return;

      releaseReservation().finally(() => {
        if (typeof onBack === "function") {
          onBack();
        }
      });
    }

    useEffect(() => {
      function handlePageHide() {
        if (!reservation?.booking_id || !reservation?.release_token) {
          return;
        }

        fetch("/api/seats", {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            bookingId: reservation.booking_id,
            releaseToken: reservation.release_token,
          }),
          keepalive: true,
        }).catch(() => {
          // The existing reservation expiry remains the fallback.
        });
      }

      window.addEventListener("pagehide", handlePageHide);

      return () => {
        window.removeEventListener("pagehide", handlePageHide);
      };
    }, [reservation?.booking_id, reservation?.release_token]);


    async function readApiResponse(response, fallbackMessage) {
      const contentType = response.headers.get("content-type") || "";

      if (!contentType.includes("application/json")) {
        const responseText = await response.text();

        console.error("API returned a non-JSON response:", {
          status: response.status,
          body: responseText.slice(0, 500),
        });

        throw new Error(
          `Server error (${response.status}). Check your API route and terminal logs.`
        );
      }

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || fallbackMessage);
      }

      return data;
    }

    async function handlePayment() {
      if (processingPayment) return;

      setProcessingPayment(true);
      setLocalPaymentMessage("");

      try {
        // 1. Create the Razorpay order on the server.
        const orderResponse = await fetch("/api/create-order", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            bookingId: reservation.booking_id,
          }),
        });

        const orderData = await readApiResponse(
          orderResponse,
          "Could not create payment order."
        );

        // 2. Load Razorpay Checkout if it isn't already loaded.
        if (!window.Razorpay) {
          let script = document.querySelector(
            'script[src="https://checkout.razorpay.com/v1/checkout.js"]'
          );

          if (!script) {
            script = document.createElement("script");
            script.src =
              "https://checkout.razorpay.com/v1/checkout.js";
            script.async = true;
            document.body.appendChild(script);
          }

          await new Promise((resolve, reject) => {
            if (window.Razorpay) {
              resolve();
              return;
            }

            script.addEventListener("load", resolve, { once: true });
            script.addEventListener(
              "error",
              () => reject(new Error("Could not load Razorpay Checkout.")),
              { once: true }
            );
          });
        }

        if (!window.Razorpay) {
          throw new Error("Razorpay Checkout could not be loaded.");
        }

        // 3. Open the Razorpay payment window.
        const checkout = new window.Razorpay({
          key: orderData.keyId,
          amount: orderData.amount,
          currency: orderData.currency,
          name: "Thespian Tickets",
          description: showTitle,
          order_id: orderData.orderId,
          theme: {
            color: "#c9a227",
          },

          // 4. Verify the payment on the server.
          handler: async (response) => {
            try {
              setLocalPaymentMessage("Verifying your payment...");

              const verifyResponse = await fetch("/api/verify-payment", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  bookingId: orderData.bookingId,
                  razorpay_order_id: response.razorpay_order_id,
                  razorpay_payment_id: response.razorpay_payment_id,
                  razorpay_signature: response.razorpay_signature,
                }),
              });

              const verifyData = await readApiResponse(
                verifyResponse,
                "Payment confirmation is pending. Keep your payment ID."
              );

              setLocalPaymentMessage(
                "Payment successful! Booking confirmed."
              );

              if (typeof onContinue === "function") {
                onContinue(verifyData);
              }
            } catch (error) {
              console.error("Payment verification error:", error);

              setLocalPaymentMessage(
                `We couldn't confirm your payment. Keep payment ID ${response.razorpay_payment_id} and contact the event team. Do not retry until the payment status is checked.`
              );
            } finally {
              setProcessingPayment(false);
            }
          },

          modal: {
            ondismiss: async () => {
              setPaymentWindowOpen(false);
              setProcessingPayment(false);
              setLocalPaymentMessage("Payment window closed. Releasing reservation...");

              await releaseReservation();

              setLocalPaymentMessage("Payment window closed. Reservation release requested.");
            },
          },
        });

        checkout.on("payment.failed", async (response) => {
          setPaymentWindowOpen(false);
          setProcessingPayment(false);
          
          setLocalPaymentMessage(
              "Payment failed. Please try again."
          );

          await releaseReservation();

          setLocalPaymentMessage("Payment failed. Reservation release requested."

          );
        });

        setPaymentWindowOpen(true);
        checkout.open();
      } catch (error) {
        console.error("Payment startup error:", error);

        setLocalPaymentMessage(
          error.message || "Could not start payment. Please try again."
        );

        setProcessingPayment(false);
      }
    }

    return (
      <main className="checkoutPage">
        <div className="checkoutCard">
          <p className="eyebrow">THESPIAN TICKETS</p>

          <h1>Review your booking</h1>

          <p className="subtitle">
            Check your reservation details before proceeding.
          </p>

          <div className="eventCard">
            <h2>{showTitle}</h2>
            <p>{showSubtitle}</p>
          </div>

          <div className="status">
            <span className="statusDot" />
            Reservation created · Payment pending
          </div>

          <section className="details">
            <div className="detailRow">
              <span>Booking ID</span>
              <strong className="bookingId">
                {reservation.booking_id}
              </strong>
            </div>

            <div className="detailRow">
              <span>Reserved seats</span>
              <strong>{seats.join(", ")}</strong>
            </div>

            <div className="detailRow">
              <span>Number of tickets</span>
              <strong>{seats.length}</strong>
            </div>

            <div className="detailRow">
              <span>Price per ticket</span>
              <strong>₹50.00</strong>
            </div>

            <div className="detailRow totalRow">
              <span>Total amount</span>
              <strong>₹{amount.toFixed(2)}</strong>
            </div>
          </section>

          <div className="expiry">
            <strong>Reservation expiry</strong>
            <p>
              {Number.isNaN(expiresAt.getTime())
                ? "Expiry time unavailable"
                : expiresAt.toLocaleString()}
            </p>
            <small>
              Complete payment before your reservation expires.
            </small>
          </div>

          <button
            type="button"
            className="paymentButton"
            onClick={handlePayment}
            disabled={processingPayment}
          >
            {processingPayment
              ? "Processing..."
              : "Continue to Payment →"}
          </button>

          <button
            type="button"
            className="backButton"
            onClick={handleBack}
            disabled={processingPayment || paymentWindowOpen}
          >
            Back to Seat Map
          </button>

          {(localPaymentMessage || paymentMessage) && (
            <p role="status" className="paymentMessage">
              {localPaymentMessage || paymentMessage}
            </p>
          )}

          <p className="securityNote">
            Your reservation is temporary until payment is completed.
          </p>
        </div>

        <style jsx>{`
          .checkoutPage {
            min-height: 100vh;
            padding: 0 16px 24px;
            display: flex;
            justify-content: center;
            align-items: flex-start;
            color: var(--ink);
          }

          .checkoutCard {
            width: 100%;
            max-width: 460px;
            margin-top: -35px;
            padding: 22px;
            border: 1px solid rgba(201, 162, 39, 0.25);
            border-radius: 16px;
            background: var(--bg-panel);
            box-shadow: 0 18px 60px rgba(0, 0, 0, 0.15);
          }

          .eyebrow {
            color: var(--gold);
            font-size: 12px;
            font-weight: 700;
            letter-spacing: 0.18em;
          }

          h1 {
            margin: 8px 0;
            font-size: clamp(24px, 4vw, 30px);
          }

          .subtitle,
          .eventCard p {
            color: var(--ink-muted);
            font-size: 14px;
            line-height: 1.6;
          }

          .eventCard {
            margin: 18px 0 14px;
            padding: 14px;
            border-radius: 10px;
            background: rgba(201, 162, 39, 0.08);
          }

          .eventCard h2 {
            margin: 0 0 8px;
            font-size: 19px;
          }

          .eventCard p {
            margin: 0;
          }

          .status {
            display: flex;
            align-items: center;
            gap: 9px;
            padding: 12px 0;
            color: var(--ink-muted);
            font-size: 13px;
          }

          .statusDot {
            width: 9px;
            height: 9px;
            flex-shrink: 0;
            border-radius: 50%;
            background: var(--gold);
          }

          .details {
            margin-top: 12px;
            border-top: 1px solid rgba(201, 162, 39, 0.2);
          }

          .detailRow {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            gap: 14px;
            padding: 11px 0;
            border-bottom: 1px solid rgba(201, 162, 39, 0.12);
            font-size: 13px;
          }

          .detailRow > span {
            color: var(--ink-muted);
          }

          .detailRow strong {
            text-align: right;
            overflow-wrap: anywhere;
          }

          .bookingId {
            max-width: 65%;
            font-size: 12px;
          }

          .totalRow {
            padding: 14px 0;
            font-size: 15px;
          }

          .totalRow strong {
            color: var(--gold);
            font-size: 20px;
          }

          .expiry {
            margin: 14px 0;
            padding: 12px;
            border-radius: 10px;
            background: rgba(201, 162, 39, 0.08);
          }

          .expiry p {
            margin: 8px 0;
            font-size: 14px;
          }

          .expiry small {
            color: var(--ink-muted);
            line-height: 1.5;
          }

          .paymentButton,
          .backButton {
            width: 100%;
            min-height: 46px;
            border-radius: 9px;
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
          }

          .paymentButton {
            margin-top: 8px;
            border: none;
            background: var(--gold);
            color: #1a0f10;
          }

          .paymentButton:hover {
            background: var(--gold-bright);
          }

          .paymentButton:disabled,
          .backButton:disabled {
            opacity: 0.65;
            cursor: not-allowed;
          }

          .backButton {
            margin-top: 10px;
            border: 1px solid rgba(201, 162, 39, 0.3);
            background: transparent;
            color: var(--ink);
          }

          .securityNote {
            margin: 18px 0 0;
            color: var(--ink-muted);
            font-size: 12px;
            text-align: center;
            line-height: 1.5;
          }

          .paymentMessage {
            margin-top: 12px;
            padding: 12px;
            border-radius: 8px;
            background: rgba(201, 162, 39, 0.08);
            color: var(--ink);
            font-size: 13px;
            text-align: center;
            line-height: 1.5;
            overflow-wrap: anywhere;
          }

          @media (max-width: 480px) {
            .checkoutCard {
              padding: 18px 15px;
            }

            .detailRow {
              gap: 10px;
            }
          }
        `}</style>
      </main>
    );
  }