"use client";


import { jsPDF } from "jspdf";
import { useEffect, useMemo, useState } from "react";
import { generateSeatLayout, SEAT_PRICE } from "@/lib/seatLayout";
import Checkout from "@/components/Checkout";

export default function SeatMap({ showTitle, showSubtitle }) {
  const { rows, totalSeats } = useMemo(() => generateSeatLayout(), []);
  const [selected, setSelected] = useState(() => new Set());
  const [unavailableSeats, setUnavailableSeats] = useState(() => new Set());

  
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showCheckout, setShowCheckout] = useState(false);
  const [message, setMessage] = useState("");
  const [reservation, setReservation] = useState(null);
  const [reservedSeats, setReservedSeats] = useState([]);
  const [paymentMessage, setPaymentMessage] = useState("");
  const [confirmedTicket, setConfirmedTicket] = useState(null);

  const [customer, setCustomer] = useState({
    name: "",
    email: "",
    phone: "",
  });

  useEffect(() => {
  let active = true;

  async function fetchAvailability() {
    try {
      const response = await fetch("/api/seats", {
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error("Could not fetch seat availability");
      }

      const data = await response.json();
      const unavailable = new Set(data.unavailableSeats ?? []);

      if (active) {
        setUnavailableSeats(unavailable);

        // Remove selected seats that another user has reserved.
        setSelected((previous) => {
          const next = new Set(previous);

          for (const seatId of unavailable) {
            next.delete(seatId);
          }

          return next;
        });
      }
    } catch (error) {
      console.error("Availability refresh failed:", error);
    }
  }

  fetchAvailability();

  const intervalId = setInterval(fetchAvailability, 5000);

  return () => {
    active = false;
    clearInterval(intervalId);
  };
}, []);

  function toggleSeat(seat) {
    if (
    seat.status === "booked" ||
    unavailableSeats.has(seat.id)
  ) {
    return;
  }
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(seat.id)) {
        next.delete(seat.id);
      } else {
        next.add(seat.id);
      }
      return next;
    });
  }

  
  async function reserveSeats() {
    setLoading(true);
    setMessage("");

    try {
      const response = await fetch("/api/seats", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          seats: selectedList,
          quantity: selectedList.length,
          name: customer.name,
          email: customer.email,
          phone: customer.phone,
        }),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(
          result.message || "Reservation failed"
        );
      }

      const booking = Array.isArray(result.reservation)
        ? result.reservation[0]
        : result.reservation;
  
      setReservedSeats([...selectedList]);
      setReservation(booking);
      setMessage("");
      setPaymentMessage("");
      setSelected(new Set());
      setShowCheckout(true);

    } catch (error) {
      setMessage(error.message || "Something went wrong.");

      try {
        const response = await fetch("/api/seats", {
          cache: "no-store",
        });

        if (response.ok) {
          const data = await response.json();
          setUnavailableSeats(new Set(data.unavailableSeats ?? []));
        }
      } catch (refreshError) {
        console.error("Could not refresh seat availability:", refreshError);
      }
    } finally {
      setLoading(false);
    }
  }


  const selectedList = Array.from(selected).sort();
  const total = selectedList.length * SEAT_PRICE;

  
  function downloadTicketsPDF() {
    if (
      !confirmedTicket ||
      !Array.isArray(confirmedTicket.tickets) ||
      confirmedTicket.tickets.length === 0
    ) {
      return;
    }

    const doc = new jsPDF();

    confirmedTicket.tickets.forEach((ticket, index) => {
      if (index > 0) {
        doc.addPage();
      }

      doc.setFontSize(20);
      doc.text("THESPIAN TICKETS", 105, 25, {
        align: "center",
      });

      doc.setFontSize(16);
      doc.text("Booking Confirmed", 105, 40, {
        align: "center",
      });

      doc.setFontSize(12);
      doc.text(`Event: ${confirmedTicket.showTitle || "Event"}`, 20, 60);
      doc.text(`Ticket Code: ${ticket.ticketCode}`, 20, 80);
      doc.text(`Seat: ${ticket.seatId}`, 20, 95);
      doc.text(`Booking Reference: ${confirmedTicket.bookingId}`, 20, 110);
      doc.text(
        `Ticket ${index + 1} of ${confirmedTicket.tickets.length}`,
        20,
        125
      );

      doc.setFontSize(10);
      doc.text("Please keep this ticket for entry.", 20, 145);
    });

    doc.save(
      `thespian-tickets-${confirmedTicket.bookingId}.pdf`
    );
  }


  
  if (confirmedTicket) {
    return (
      <main className="ticketSuccessPage">
        <section className="ticketSuccessCard">
          <p className="eyebrow">THESPIAN TICKETS</p>

          <div className="successIcon">✓</div>

          <h1>Booking Confirmed!</h1>
          <p className="successSubtitle">
            Your payment was verified and your ticket is ready.
          </p>

          <div className="ticketPreview">
            <p className="ticketLabel">YOUR TICKET CODE</p>
              {confirmedTicket.tickets.map((ticket) => (
              <div key={ticket.id} className="ticketCodeItem">
                <h2>{ticket.ticketCode}</h2>
                <p>Seat: {ticket.seatId}</p>
              </div>
            ))}
            <div className="ticketDivider" />

            <div className="ticketDetail">
              <span>Event</span>
              <strong>{confirmedTicket.showTitle}</strong>
            </div>

            <div className="ticketDetail">
              <span>Seats</span>
              <strong>{confirmedTicket.seats.join(", ")}</strong>
            </div>

            <div className="ticketDetail">
              <span>Number of tickets</span>
              <strong>{confirmedTicket.seats.length}</strong>
            </div>

            <div className="ticketDetail">
              <span>Total paid</span>
              <strong>
                ₹{(Number(confirmedTicket.amountPaise) / 100).toFixed(2)}
              </strong>
            </div>

            <div className="ticketDivider" />
            <p className="bookingReference">
              Booking reference: {confirmedTicket.bookingId}
            </p>
          </div>

          <p className="successNote">
            Keep your ticket code for reference.
          </p>
          
      <div className="ticketActionButtons">
          <button
              type="button"
              className="ticketBackButton"
              onClick={downloadTicketsPDF}
            >
              Download All Tickets (PDF)
          </button>

          <button
            type="button"
            className="ticketBackButton"
            onClick={() => {
              setConfirmedTicket(null);
              setReservation(null);
              setReservedSeats([]);
              setShowCheckout(false);
              setPaymentMessage("");
              setShowForm(false);
              setMessage("");
            }}
          >
            Back to Seat Map
          </button>
          </div>
        </section>

        <style jsx>{`
          .ticketSuccessPage {
            min-height: 100vh;
            padding: 40px 16px;
            display: flex;
            justify-content: center;
            align-items: flex-start;
            color: var(--ink);
          }

          .ticketSuccessCard {
            width: 100%;
            max-width: 460px;
            padding: 26px;
            border: 1px solid rgba(201, 162, 39, 0.3);
            border-radius: 16px;
            background: var(--bg-panel);
            box-shadow: 0 18px 60px rgba(0, 0, 0, 0.15);
            text-align: center;
          }

          .eyebrow {
            color: var(--gold);
            font-size: 12px;
            font-weight: 700;
            letter-spacing: 0.18em;
          }

          .successIcon {
            width: 54px;
            height: 54px;
            margin: 24px auto 14px;
            display: grid;
            place-items: center;
            border: 1px solid var(--gold);
            border-radius: 50%;
            color: var(--gold);
            font-size: 30px;
          }

          h1 {
            margin: 8px 0;
            font-size: 28px;
          }

          .successSubtitle,
          .successNote {
            color: var(--ink-muted);
            font-size: 14px;
            line-height: 1.6;
          }

          .ticketPreview {
            margin-top: 24px;
            padding: 20px;
            border: 1px dashed var(--gold);
            border-radius: 12px;
            text-align: left;
          }

          .ticketLabel {
            margin: 0;
            color: var(--ink-muted);
            font-size: 11px;
            letter-spacing: 0.12em;
            text-align: center;
          }

          .ticketPreview h2 {
            margin: 10px 0 20px;
            color: var(--gold);
            font-size: 25px;
            text-align: center;
            overflow-wrap: anywhere;
          }

          .ticketCodeItem {
            padding: 12px 0;
            text-align: center;
            border-bottom: 1px dashed rgba(201, 162, 39, 0.3);
          }

          .ticketCodeItem h2 {
            margin: 10px 0;
            color: var(--gold);
            font-size: 25px;
            overflow-wrap: anywhere;
          }

          .ticketCodeItem p {
            margin: 0 0 8px;
            color: var(--ink-muted);
            font-size: 13px;
          }

          .ticketDivider {
            border-top: 1px dashed rgba(201, 162, 39, 0.45);
            margin: 16px 0;
          }

          .ticketDetail {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            gap: 12px;
            padding: 9px 0;
            font-size: 13px;
          }

          .ticketDetail span {
            color: var(--ink-muted);
          }

          .ticketDetail strong {
            text-align: right;
            overflow-wrap: anywhere;
          }

          .bookingReference {
            color: var(--ink-muted);
            font-size: 11px;
            overflow-wrap: anywhere;
          }

          .successNote {
            margin: 20px 0;
          }

          
          .ticketActionButtons {
            display: flex;
            flex-direction: column;
            gap: 12px;
          }

          .ticketActionButtons .ticketBackButton {
            display: block;
            width: 100%;
            margin: 0;
            box-sizing: border-box;
          }


          .ticketBackButton {
            width: 100%;
            min-height: 46px;
            border: none;
            border-radius: 9px;
            background: var(--gold);
            color: #1a0f10;
            font-weight: 600;
            cursor: pointer;
          }

          @media (max-width: 480px) {
            .ticketSuccessCard {
              padding: 20px 15px;
            }
          }
        `}</style>
      </main>
    );
  }


  if (showCheckout && reservation) {
    return (
      <Checkout
        reservation={reservation}
        seats={reservedSeats}
        showTitle={showTitle}
        showSubtitle={showSubtitle}
        paymentMessage={paymentMessage}
        onBack={async () => {
          setShowCheckout(false);
          setPaymentMessage("");
          setShowForm(false);

          const currentReservation = reservation;

          try {
            if (reservation?.booking_id && reservation?.release_token) {
              const response = await fetch("/api/seats", {
                method: "DELETE",
                headers: {
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  bookingId: reservation.booking_id,
                  releaseToken: reservation.release_token,
                }),
              });

              if (!response.ok) {
                console.warn("Reservation could not be released.");
              }
            }
          } catch (error) {
            console.error("Could not release reservation:", error);
          }
        }}
        
      onContinue={(verifyData) => {
        if (
          !verifyData?.success ||
          !verifyData.bookingId ||
          !Array.isArray(verifyData.tickets) ||
          verifyData.tickets.length !== reservedSeats.length
        ) {
          setPaymentMessage(
            "Payment may have succeeded, but ticket details could not be confirmed. Please contact the event team before trying again."
          );
          return;
        }

        setConfirmedTicket({
          tickets: verifyData.tickets,
          bookingId: verifyData.bookingId,
          paymentId: verifyData.paymentId,
          showTitle,
          showSubtitle,
          seats: [...reservedSeats],
          amountPaise: reservation.total_paise,
        });

        setShowCheckout(false);
        setPaymentMessage("");
      }}

      />
    );
  }

  return (
    <div className="wrap">
      <header className="head">
        <p className="eyebrow">{totalSeats} seats total</p>
        <h1>{showTitle}</h1>
        <p className="subtitle">{showSubtitle}</p>
      </header>

      <div className="stageArea">
        <div className="stage">STAGE</div>
      </div>

      <div className="mapScroll">
        <div className="map">
          {rows.map((row) => (
            <div className="row" key={row.rowLabel}>
              <span className="rowLabel">{row.rowLabel}</span>
              <div className="blocks">
                {row.blocks.map((block, bi) => (
                  <div className="block" key={bi}>
                    {block.map((seat) => (
                      <button
                        key={seat.id}
                        type="button"
                        className={`seat ${
                          unavailableSeats.has(seat.id) || seat.status === "booked"
                            ? "booked"
                            : seat.status
                        } ${selected.has(seat.id) ? "selected" : ""}`}
                        disabled={
                          showForm ||
                          showCheckout ||
                          seat.status === "booked" ||
                          unavailableSeats.has(seat.id)
                        }
                        onClick={() => toggleSeat(seat)}
                        aria-label={`Seat ${seat.label},${
                          unavailableSeats.has(seat.id) || seat.status === "booked"
                            ? "unavailable"
                            : selected.has(seat.id)
                              ? "selected"
                              : seat.status
                        }`}
                        title={seat.label}
                      />
                    ))}
                  </div>
                ))}
              </div>
              <span className="rowLabel rowLabelRight">{row.rowLabel}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="legend">
        <span className="legendItem">
          <i className="swatch available" /> Available
        </span>
        <span className="legendItem">
          <i className="swatch selected" /> Selected
        </span>
        <span className="legendItem">
          <i className="swatch booked" /> Taken
        </span>
      </div>

      <div className="summaryBar">
        <div className="summaryInfo">
          {selectedList.length === 0 ? (
            <span className="summaryHint">Tap a seat to select it</span>
          ) : (
            <>
              <span className="summaryCount">
                {selectedList.length} seat{selectedList.length > 1 ? "s" : ""}
              </span>
              <span className="summarySeats">{selectedList.join(", ")}</span>
            </>
          )}
        </div>
        <div className="summaryAction">
          <span className="summaryTotal">₹{total}</span>
          
              <button 
                type="button"
                className="continueBtn"
                disabled={
                  selectedList.length === 0 ||
                  selectedList.length > 5
                }
                onClick={() => {
                  setShowForm(true);
                  setMessage("");
                  setReservation(null);
                }}
              >
                Continue
              </button>

        </div>
      </div>
      
      
      
      {showForm && !reservation && (
        <div className="bookingModalOverlay">
          <form
            className="bookingModal"
            onSubmit={(e) => {
              e.preventDefault();
              reserveSeats();
            }}
          >
            <div className="bookingModalHeader">
              <p className="bookingEyebrow">THESPIAN TICKETS</p>
              <h2>Complete your booking</h2>
              <p className="bookingDescription">
                Enter your details to reserve your seats.
              </p>
            </div>

            <div className="bookingSummary">
              <div>
                <span className="bookingSummaryLabel">SELECTED SEATS</span>
                <strong className="bookingSeats">
                  {selectedList.join(", ")}
                </strong>
              </div>

              <div className="bookingPrice">
                <span className="bookingSummaryLabel">TOTAL AMOUNT</span>
                <strong>₹{total.toFixed(2)}</strong>
              </div>
            </div>

            <div className="bookingFields">
              <label className="bookingField">
                <span>Full name</span>
                <input
                  required
                  autoComplete="name"
                  placeholder="Enter your full name"
                  value={customer.name}
                  onChange={(e) =>
                    setCustomer({
                      ...customer,
                      name: e.target.value,
                    })
                  }
                />
              </label>

              <label className="bookingField">
                <span>Email address</span>
                <input
                  required
                  type="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  value={customer.email}
                  onChange={(e) =>
                    setCustomer({
                      ...customer,
                      email: e.target.value,
                    })
                  }
                />
              </label>

              <label className="bookingField">
                <span>Phone number</span>
                <input
                  required
                  type="tel"
                  autoComplete="tel"
                  inputMode="numeric"
                  pattern="[0-9]{10,15}"
                  title="Enter 10 to 15 digits."
                  placeholder="Enter your phone number"
                  value={customer.phone}
                  onChange={(e) =>
                    setCustomer({
                      ...customer,
                      phone: e.target.value,
                    })
                  }
                />
              </label>
            </div>

            {message && (
              <p className="bookingError" role="alert">
                {message}
              </p>
            )}

            <div className="bookingModalActions">
              <button
                className="bookingReserveButton"
                type="submit"
                disabled={loading}
              >
                {loading ? "Reserving seats..." : "Reserve Seats"}
              </button>

              <button
                className="bookingCancelButton"
                type="button"
                onClick={() => setShowForm(false)}
                disabled={loading}
              >
                Cancel
              </button>
            </div>

            <p className="bookingFootnote">
              Your reservation will be confirmed once the seats are successfully reserved.
            </p>
          </form>
        </div>
      )}

      <style jsx>{`
        .wrap {
          max-width: 640px;
          margin: 0 auto;
          padding: 48px 20px 160px;
        }

        .head {
          text-align: center;
          margin-bottom: 36px;
        }

        .eyebrow {
          font-size: 13px;
          color: var(--ink-muted);
          margin: 0 0 10px;
          letter-spacing: 0.02em;
        }

        h1 {
          font-family: var(--font-display);
          font-weight: 500;
          font-size: clamp(28px, 5vw, 40px);
          margin: 0 0 10px;
          line-height: 1.15;
        }

        .subtitle {
          color: var(--ink-muted);
          font-size: 14px;
          margin: 0;
        }

        .stageArea {
          display: flex;
          justify-content: center;
          margin-bottom: 40px;
        }

        .stage {
          width: 78%;
          max-width: 420px;
          height: 34px;
          background: linear-gradient(
            180deg,
            var(--curtain) 0%,
            var(--curtain-deep) 100%
          );
          clip-path: polygon(8% 0%, 92% 0%, 100% 100%, 0% 100%);
          display: flex;
          align-items: center;
          justify-content: center;
          font-family: var(--font-ui);
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.25em;
          color: var(--ink);
          opacity: 0.85;
          box-shadow: 0 12px 40px -8px rgba(122, 31, 43, 0.65);
        }

        .mapScroll {
          overflow-x: auto;
          padding-bottom: 8px;
        }

        .map {
          display: flex;
          flex-direction: column;
          gap: 6px;
          width: max-content;
          margin: 0 auto;
        }

        .row {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
        }

        .rowLabel {
          width: 18px;
          text-align: center;
          font-size: 11px;
          color: var(--ink-muted);
          font-variant-numeric: tabular-nums;
        }

        .rowLabelRight {
          margin-left: -2px;
        }

        .blocks {
          display: flex;
          gap: 22px;
        }

        .block {
          display: flex;
          gap: 5px;
        }

        .seat {
          width: 22px;
          height: 22px;
          border-radius: 5px;
          border: 1.5px solid var(--gold);
          background: transparent;
          padding: 0;
          cursor: pointer;
          transition: transform 0.12s ease, background 0.12s ease;
        }

        .seat:hover:not(:disabled) {
          transform: translateY(-2px);
          background: rgba(201, 162, 39, 0.18);
        }

        .seat.selected {
          background: var(--gold-bright);
          border-color: var(--gold-bright);
        }

        .seat.booked {
          border-color: var(--booked);
          background: var(--booked);
          cursor: not-allowed;
        }

        .legend {
          display: flex;
          justify-content: center;
          gap: 20px;
          margin-top: 28px;
          flex-wrap: wrap;
        }

        .legendItem {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          font-size: 12px;
          color: var(--ink-muted);
        }

        .swatch {
          width: 13px;
          height: 13px;
          border-radius: 4px;
          border: 1.5px solid var(--gold);
          display: inline-block;
        }

        .swatch.available {
          background: transparent;
        }

        .swatch.selected {
          background: var(--gold-bright);
          border-color: var(--gold-bright);
        }

        .swatch.booked {
          background: var(--booked);
          border-color: var(--booked);
        }

        .summaryBar {
          position: fixed;
          left: 0;
          right: 0;
          bottom: 0;
          background: var(--bg-panel);
          border-top: 1px solid rgba(201, 162, 39, 0.2);
          padding: 16px 20px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
        }

        .summaryInfo {
          display: flex;
          flex-direction: column;
          gap: 2px;
          min-width: 0;
        }

        .summaryHint {
          font-size: 13px;
          color: var(--ink-muted);
        }

        .summaryCount {
          font-size: 14px;
          font-weight: 600;
        }

        .summarySeats {
          font-size: 12px;
          color: var(--ink-muted);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .summaryAction {
          display: flex;
          align-items: center;
          gap: 14px;
          flex-shrink: 0;
        }

        .summaryTotal {
          font-family: var(--font-display);
          font-size: 18px;
        }

        .continueBtn {
          background: var(--gold);
          color: #1a0f10;
          border: none;
          border-radius: 8px;
          padding: 11px 22px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          transition: background 0.15s ease;
        }

        .continueBtn:hover:not(:disabled) {
          background: var(--gold-bright);
        }

        .continueBtn:disabled {
          background: var(--booked);
          color: var(--booked-text);
          cursor: not-allowed;
        }

        /* ================================
   BOOKING MODAL
================================ */

      .bookingModalOverlay {
        position: fixed;
        inset: 0;
        z-index: 1000;
        display: flex;
        align-items: center;
        justify-content: center;
        overflow-y: auto;
        padding: 24px 16px;
        background: rgba(8, 4, 6, 0.82);
        backdrop-filter: blur(7px);
      }

      .bookingModal {
        width: 100%;
        max-width: 440px;
        max-height: calc(100dvh - 48px);
        overflow-y: auto;
        margin: auto;
        padding: 30px;
        box-sizing: border-box;
        border: 1px solid rgba(201, 162, 39, 0.35);
        border-radius: 18px;
        background: var(--bg-panel);
        color: var(--ink);
        box-shadow: 0 24px 80px rgba(0, 0, 0, 0.4);
      }

      .bookingModalHeader {
        margin-bottom: 24px;
      }

      .bookingEyebrow {
        margin: 0 0 10px;
        color: var(--gold);
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.2em;
      }

      .bookingModalHeader h2 {
        margin: 0 0 9px;
        font-family: var(--font-display);
        font-size: clamp(24px, 5vw, 30px);
        font-weight: 500;
        line-height: 1.2;
      }

      .bookingDescription {
        margin: 0;
        color: var(--ink-muted);
        font-size: 13px;
        line-height: 1.6;
      }

      /* Seat and price summary */

      .bookingSummary {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 14px;
        margin-bottom: 24px;
        padding: 17px;
        border: 1px solid rgba(201, 162, 39, 0.22);
        border-radius: 12px;
        background: rgba(201, 162, 39, 0.055);
      }

      .bookingSummary > div {
        display: flex;
        flex-direction: column;
        gap: 7px;
        min-width: 0;
      }

      .bookingSummaryLabel {
        color: var(--ink-muted);
        font-size: 10px;
        font-weight: 600;
        letter-spacing: 0.1em;
      }

      .bookingSeats {
        overflow-wrap: anywhere;
        font-size: 15px;
      }

      .bookingPrice {
        flex-shrink: 0;
        text-align: right;
      }

      .bookingPrice strong {
        color: var(--gold);
        font-size: 21px;
        font-variant-numeric: tabular-nums;
      }

      /* Customer form fields */

      .bookingFields {
        display: flex;
        flex-direction: column;
        gap: 17px;
      }

      .bookingField {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      .bookingField > span {
        color: var(--ink);
        font-size: 13px;
        font-weight: 600;
      }

      .bookingField input {
        display: block;
        width: 100%;
        min-height: 46px;
        box-sizing: border-box;
        padding: 12px 13px;
        border: 1px solid rgba(201, 162, 39, 0.28);
        border-radius: 9px;
        outline: none;
        background: rgba(0, 0, 0, 0.16);
        color: var(--ink);
        font: inherit;
        font-size: 14px;
        transition: border-color 0.2s, box-shadow 0.2s;
      }

      .bookingField input::placeholder {
        color: var(--ink-muted);
        opacity: 0.8;
      }

      .bookingField input:focus {
        border-color: var(--gold);
        box-shadow: 0 0 0 3px rgba(201, 162, 39, 0.12);
      }

      /* Reservation error */

      .bookingError {
        margin: 16px 0 0;
        color: #ff9999;
        font-size: 13px;
        line-height: 1.5;
      }

      /* Reserve and cancel buttons */

      .bookingModalActions {
        display: flex;
        flex-direction: column;
        gap: 11px;
        margin-top: 25px;
      }

      .bookingModalActions button {
        display: block;
        width: 100%;
        min-height: 46px;
        box-sizing: border-box;
        padding: 12px 16px;
        border-radius: 9px;
        font: inherit;
        font-size: 14px;
        font-weight: 600;
        cursor: pointer;
        transition:
          background 0.2s,
          border-color 0.2s,
          transform 0.2s;
      }

      .bookingReserveButton {
        border: 1px solid var(--gold);
        background: var(--gold);
        color: #1a0f10;
      }

      .bookingReserveButton:hover:not(:disabled) {
        background: var(--gold-bright);
        transform: translateY(-1px);
      }

      .bookingCancelButton {
        border: 1px solid rgba(201, 162, 39, 0.3);
        background: transparent;
        color: var(--ink);
      }

      .bookingCancelButton:hover:not(:disabled) {
        border-color: var(--gold);
        background: rgba(201, 162, 39, 0.07);
      }

      .bookingModalActions button:disabled {
        opacity: 0.6;
        cursor: not-allowed;
      }

      /* Informational note */

      .bookingFootnote {
        margin: 17px 0 0;
        color: var(--ink-muted);
        font-size: 11px;
        line-height: 1.6;
        text-align: center;
      }

      /* Responsive layout */

      @media (max-width: 480px) {
        .bookingModal {
          padding: 23
      `}</style>
    </div>
  );
}
