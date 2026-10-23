"use client";


import { jsPDF } from "jspdf";
import { useEffect, useMemo, useState } from "react";
import { generateSeatLayout, getSeatPrice } from "@/lib/seatLayout";
import Checkout from "@/components/Checkout";
import QRCode from "qrcode";

export default function SeatMap({ showId, showTitle, showSubtitle }) {
  const { rows, totalSeats } = useMemo(() => generateSeatLayout(), []);
  const [selected, setSelected] = useState(() => new Set());
  const [ticketQuantity, setTicketQuantity] = useState(2);
  const [showQuantityModal, setShowQuantityModal] = useState(true);
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
      const response = await fetch(
        `/api/seats?showId=${encodeURIComponent(showId)}`,
        {
          cache: "no-store",
        }
      );

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
}, [showId]);


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
        // Do not allow more seats than the chosen quantity.
        if (next.size >= ticketQuantity) {
          return prev;
        }

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
          showId: showId,
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
        const response = await fetch(
          `/api/seats?showId=${encodeURIComponent(showId)}`,
          {
            cache: "no-store",
          }
        );

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

  const seatPrices = useMemo(
    () =>
      new Map(
        rows.flatMap((row) =>
          row.blocks.flatMap((block) =>
            block
              .filter((seat) => seat.status !== "empty")
              .map((seat) => [
                seat.id,
                getSeatPrice(row.rowNumber),
              ])
          )
        )
      ),
    [rows]
  );

  const total = selectedList.reduce(
    (sum, seatId) => sum + (seatPrices.get(seatId) ?? 0),
    0
  );
  
  
  

  async function downloadTicketsPDF() {
    if (
      !confirmedTicket ||
      !Array.isArray(confirmedTicket.tickets) ||
      confirmedTicket.tickets.length === 0
    ) {
      return;
    }

    // Landscape A4: 297 mm × 210 mm
    const doc = new jsPDF("landscape", "mm", "a4");
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();

    const gold = [218, 178, 76];
    const paleGold = [255, 226, 145];
    const black = [13, 12, 9];
    const white = [255, 250, 235];
    const muted = [192, 181, 151];

    const tickets = confirmedTicket.tickets;
    const eventTitle = confirmedTicket.showTitle || "Event";
    const eventSubtitle = confirmedTicket.showSubtitle || "";
    const bookingId = confirmedTicket.bookingId || "N/A";

    for (const [index, ticket] of tickets.entries()) {
      if (index > 0) doc.addPage("a4", "landscape");

      const code = String(ticket.ticketCode || "N/A");
      const seatId = String(ticket.seatId || "N/A");

      // Each ticket must have its own unique barcode token.
      if (!ticket.barcodeToken) {
        window.alert(
          "A ticket QR code is missing. Please contact the event team."
        );
        return;
      }

      // The QR opens the organiser's protected ticket-verification page.
      const scanUrl = new URL(
        "/organizer/scan",
        window.location.origin
      );

      scanUrl.searchParams.set("token", ticket.barcodeToken);

      const qrDataUrl = await QRCode.toDataURL(scanUrl.toString(), {
        width: 320,
        margin: 2,
        errorCorrectionLevel: "M",
      });

      // Background
      doc.setFillColor(18, 17, 13);
      doc.rect(0, 0, pageWidth, pageHeight, "F");

      // Outer gold frame
      doc.setDrawColor(...gold);
      doc.setLineWidth(0.6);
      doc.roundedRect(7, 7, pageWidth - 14, pageHeight - 14, 3, 3, "S");

      // Straight horizontal ticket
      const x = 22;
      const y = 32;
      const w = 253;
      const h = 108;
      const stubW = 43;

      // Ticket shadow
      doc.setFillColor(5, 5, 4);
      doc.roundedRect(x + 2, y + 2, w, h, 3, 3, "F");

      // Main ticket body
      doc.setFillColor(...black);
      doc.setDrawColor(...gold);
      doc.setLineWidth(1);
      doc.roundedRect(x, y, w, h, 3, 3, "FD");

      // Gold stub
      doc.setFillColor(202, 160, 52);
      doc.setDrawColor(...paleGold);
      doc.roundedRect(x, y, stubW, h, 3, 3, "FD");

      // Straighten the stub's right edge
      doc.setFillColor(202, 160, 52);
      doc.rect(x + stubW - 3, y + 1, 4, h - 2, "F");

      // Perforation effect
      doc.setDrawColor(91, 69, 26);
      doc.setLineWidth(0.5);

      for (let py = y + 4; py < y + h - 4; py += 5) {
        doc.line(
          x + stubW,
          py,
          x + stubW + 2,
          py + 2.5
        );
      }



      // Code and admission text on stub
      doc.setFont("helvetica", "bold");
      doc.setFontSize(6);
      doc.setTextColor(20, 16, 7);
      doc.text(
        "ADMIT ONE",
        x + stubW / 2,
        y + 91,
        { align: "center" }
      );

      

      // Main ticket content
      const contentX = x + stubW + 8;
      const contentRight = x + w - 8;
      const contentW = contentRight - contentX;
      const centerX = (contentX + contentRight) / 2;

      // Brand
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(...paleGold);
      doc.text("T H E S P I A N   T I C K E T S", centerX, y + 13, {
        align: "center",
      });

      doc.setDrawColor(...gold);
      doc.setLineWidth(0.4);
      doc.line(contentX + 5, y + 18, contentRight - 5, y + 18);

      // Event title
      doc.setFont("times", "bolditalic");
      doc.setFontSize(22);
      doc.setTextColor(...gold);

      const titleLines = doc
        .splitTextToSize(eventTitle, contentW - 10)
        .slice(0, 2);

      doc.text(titleLines, centerX, y + 39, {
        align: "center",
        lineHeightFactor: 1.1,
      });

      // Ticket subtitle
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.setTextColor(...white);
      doc.text("THEATRE TICKET", centerX, y + 50, {
        align: "center",
      });

      // Show date, time and venue
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(...muted);

      const subtitleLines = doc.splitTextToSize(
        eventSubtitle,
        contentW - 12
      ).slice(0, 2);

      doc.text(subtitleLines, centerX, y + 56, {
        align: "center",
        lineHeightFactor: 1.2,
      });

      // Gold confirmation strip
      doc.setFillColor(202, 160, 52);
      doc.roundedRect(centerX - 34, y + 66, 68, 9, 1.5, 1.5, "F");

      doc.setFont("helvetica", "bold");
      doc.setFontSize(7);
      doc.setTextColor(20, 17, 10);
      doc.text("BOOKING CONFIRMED", centerX, y + 72, {
        align: "center",
      });

      // Seat details
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.setTextColor(...muted);
      doc.text("RESERVED SEAT", contentX + 5, y + 85);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(14);
      doc.setTextColor(...paleGold);
      doc.text(seatId, contentX + 5, y + 95);

      // Ticket count
      // QR code for organiser verification
      const qrSize = 25;
      const qrX = x + (stubW - qrSize) / 2;
      const qrY = y + 20;

      doc.addImage(
        qrDataUrl,
        "PNG",
        qrX,
        qrY,
        qrSize,
        qrSize
      );

      // QR caption
      doc.setFont("helvetica", "bold");
      doc.setFontSize(5.5);
      doc.setTextColor(20,16, 7);
      doc.text(
        "SCAN TO VERIFY",
        qrX + qrSize / 2,
        qrY + qrSize + 8,
        { align: "center" }
      );

      // Ticket count, positioned below the QR caption
      doc.setFontSize(7);
      doc.setTextColor(...white);
      doc.text(
        `TICKET ${index + 1} OF ${tickets.length}`,
        contentRight - 5,
        y + 101,
        { align: "right" }
      );

      // Details beneath the ticket
      doc.setDrawColor(...gold);
      doc.setLineWidth(0.4);
      doc.line(25, 151, pageWidth - 25, 151);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(...white);
      doc.text(
        doc.splitTextToSize(code, 105).slice(0, 2),
        27,
        171
      );

      // Booking reference
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(...gold);
      doc.text("BOOKING REFERENCE", 160, 163);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(...white);
      doc.text(
        doc.splitTextToSize(String(bookingId), 105).slice(0, 2),
        160,
        171
      );

      // Footer
      doc.setFont("helvetica", "italic");
      doc.setFontSize(8);
      doc.setTextColor(...muted);
      doc.text(
        "YOUR NIGHT AT THE THEATRE AWAITS",
        pageWidth / 2,
        195,
        { align: "center" }
      );
    }

    doc.save(`thespian-tickets-${bookingId}.pdf`);
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
              <span>Date & Venue</span>
              <strong>{confirmedTicket.showSubtitle}</strong>
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
            padding: 8px 16px 24px;
            display: flex;
            justify-content: center;
            align-items: flex-start;
            color: var(--ink);
            box-sizing: border-box;
          }

          .ticketSuccessCard {
            width: 100%;
            max-width: 460px;
            padding: 20px;
            box-sizing: border-box;
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
            width: 50px;
            height: 50px;
            margin: 16px auto 10px;
            display: grid;
            place-items: center;
            border: 1px solid var(--gold);
            border-radius: 50%;
            color: var(--gold);
            font-size: 28px;
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
            margin-top: 18px;
            padding: 16px;
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
            padding: 8px 0;
            text-align: center;
            border-bottom: 1px dashed rgba(201, 162, 39, 0.3);
          }

          .ticketCodeItem h2 {
            margin: 6px 0;
            color: var(--gold);
            font-size: 24px;
            overflow-wrap: anywhere;
          }

          .ticketCodeItem p {
            margin: 0 0 5px;
            color: var(--ink-muted);
            font-size: 13px;
          }

          .ticketDivider {
            border-top: 1px dashed rgba(201, 162, 39, 0.45);
            margin: 12px 0;
          }

          .ticketDetail {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            gap: 12px;
            padding: 6px 0;
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
              padding: 18px 14px;
            }
            
            .ticketSuccessPage {
              padding: 16px 12px;
            }
              
            .ticketCodeItem h2 {
              font-size: 22px;
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
        <h1>{showTitle}</h1>
        <p className="subtitle">{showSubtitle}</p>
      </header>

      <div className="stageArea">
        <div className="stage">STAGE</div>
      </div>

      
      {showQuantityModal && (
        <div className="quantityOverlay">
          <section
            className="quantityModal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="quantityTitle"
          >
            <p className="quantityEyebrow">THESPIAN TICKETS</p>

            <h2 id="quantityTitle">How many tickets?</h2>

            <p className="quantitySubtitle">
              Choose the number of seats you want to book.
            </p>

            <div className="quantityOptions">
              {[1, 2, 3, 4, 5].map((number) => (
                <button
                  key={number}
                  type="button"
                  className={`quantityOption ${
                    ticketQuantity === number ? "active" : ""
                  }`}
                  aria-pressed={ticketQuantity === number}
                  onClick={() => setTicketQuantity(number)}
                >
                  {number}
                </button>
              ))}
            </div>

            <div className="quantityDivider" />

            <div className="quantityPrices">
              <div className="quantityPrice premiumText">
                <span>PREMIUM</span>
                <strong>₹75</strong>
                <small>Rows A–E</small>
              </div>

              <div className="quantityPrice standardText">
                <span>CLASSIC</span>
                <strong>₹50</strong>
                <small>Rows F–K</small>
              </div>

              <div className="quantityPrice economyText">
                <span>ECONOMY</span>
                <strong>₹40</strong>
                <small>Rows L–P</small>
              </div>
            </div>

            <p className="quantityNote">
              Final price depends on the seats you select.
            </p>

            <button
              type="button"
              className="quantityContinue"
              onClick={() => {
                setSelected(new Set());
                setShowQuantityModal(false);
              }}
            >
              Select Seats
            </button>
          </section>
        </div>
      )}


      <div className="mapScroll">
        <div className="map">
          {rows.map((row) => (
            <div className="row" key={row.rowLabel}>
              <span className="rowLabel">{row.rowLabel}</span>
              {/* Note the inline position: relative here */}
              <div className="blocks" style={{ position: "relative" }}>
                
                {/* 1. Conditionally render the arrow for Row H with INLINE styles to fix the layout bug */}
                {row.rowLabel === "H" && (
                  <div
                    style={{
                      position: "absolute",
                      left: "50%",
                      top: "50%",
                      transform: "translate(-50%, -50%)",
                      color:  "#e8c75a",
                      pointerEvents: "none",
                      zIndex: 0,
                      animation: "arrowShimmer 2.2s ease-in-out infinite",
                      filter: "drop-shadow(0 0 4px rgba(255, 215, 100, 0.75))",
                    }}
                  >
                    <svg aria-hidden="true" width="24" height="140" viewBox="0 0 24 140" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 140V4" />
                      <path d="M5 11l7-7 7 7" />
                    </svg>
                  </div>
                )}

                {/* 2. Map through the seat blocks normally */}
                {row.blocks.map((block, bi) => (
                  <div className="block" key={bi}>
                    {block.map((seat) => {
                      if (seat.status === "empty") {
                        return <div key={seat.id} className="seat empty" />;
                      }

                      return (
                        <button
                          key={seat.id}
                          type="button"
                          className={`seat ${
                            unavailableSeats.has(seat.id) || seat.status === "booked"
                              ? "booked"
                              : seat.status
                          } ${
                            getSeatPrice(row.rowNumber) === 75
                              ? "premium"
                              : getSeatPrice(row.rowNumber) === 50
                                ? "standard"
                                : "economy"
                          } ${selected.has(seat.id) ? "selected" : ""}`}
                          disabled={
                            showQuantityModal ||
                            showForm ||
                            showCheckout ||
                            seat.status === "booked" ||
                            unavailableSeats.has(seat.id)
                          }
                          onClick={() => toggleSeat(seat)}
                          aria-label={`Seat ${seat.label}, ₹${getSeatPrice(row.rowNumber)}`}
                          title={`Seat ${seat.label} — ₹${getSeatPrice(row.rowNumber)}`}
                        />
                      );
                    })}
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

        <span className="legendItem">
          <i className="swatch premiumPrice" /> Rows A–E: ₹75
        </span>

        <span className="legendItem">
          <i className="swatch standardPrice" /> Rows F–K: ₹50
        </span>

        <span className="legendItem">
          <i className="swatch economyPrice" /> Rows L–P: ₹40
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
          padding: 4px 20px 160px;
        }

        .head {
          text-align: center;
          margin-bottom: 24px;
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
          margin-bottom: 20px;
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
          gap: 5px;
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
          gap: clamp(24px, 6vw, 54px);
          position: relative;
        }

        .aisleIndicator {
          position: absolute;
          left: 50%;
          top: 50%;
          transform: translate(-50%, -50%);
          color: rgba(201, 162, 39, 0.25); /* Muted gold so it doesn't distract from seats */
          pointer-events: none; /* CRITICAL: ensures clicking the arrow doesn't block seat clicks */
          z-index: 0;
          animation: driftUp 3s infinite ease-in-out;
        }

        @keyframes arrowShimmer {
          0%, 100% {
            opacity: 0.35;
            filter: drop-shadow(0 0 2px rgba(255, 215, 100, 0.3));
          }

          50% {
            opacity: 1;
            filter:
              drop-shadow(0 0 5px rgba(255, 215, 100, 0.9))
              drop-shadow(0 0 12px rgba(255, 190, 60, 0.65));
          }
        }

        @keyframes driftUp {
          0%, 100% { transform: translate(-50%, -50%); }
          50% { transform: translate(-50%, -58%); }
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

        .seat.premium {
          border-color: #d9b45b;
        }

        .seat.standard {
          border-color: #83a9d9;
        }

        .seat.economy {
          border-color: #77b89a;
        }

        .seat.premium:hover:not(:disabled) {
          background: rgba(217, 180, 91, 0.2);
        }

        .seat.standard:hover:not(:disabled) {
          background: rgba(131, 169, 217, 0.2);
        }

        .seat.economy:hover:not(:disabled) {
          background: rgba(119, 184, 154, 0.2);
        }

        .seat.empty {
          visibility: hidden;
          pointer-events: none;
          border: none;
          background: transparent;
        }

        .seat:hover:not(:disabled):not(.selected) {
          transform: translateY(-2px);
          background: rgba(201, 162, 39, 0.18);
        }

        .seat.selected,
        .seat.selected:hover,
        .seat.selected:focus,
        .seat.selected:active {
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
          align-items: center;
          gap: 10px 16px;
          margin-top: 14px;
          flex-wrap: wrap;
        }

        .legendItem {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-size: 11px;
          color: var(--ink-muted);
          white-space: nowrap;
        }

        @media (max-width: 480px) {
          .legend {
            gap: 10px 12px;
          }

          .legendItem {
            font-size: 10px;
            gap: 5px;
          }

          .swatch {
            width: 11px;
            height: 11px;
            flex-shrink: 0;
          }
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

        .swatch.premiumPrice {
          background: #d9b45b;
          border-color: #d9b45b;
        }

        .swatch.standardPrice {
          background: #83a9d9;
          border-color: #83a9d9;
        }

        .swatch.economyPrice {
          background: #77b89a;
          border-color: #77b89a;
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
        align-items: flex-start;
        justify-content: center;
        overflow-y: auto;
        padding: 36px 16px 24px;
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
          padding: 23;
        }
      }

      
      /* =====================================
        INITIAL TICKET QUANTITY POPUP
      ===================================== */

      .quantityOverlay {
        position: fixed;
        inset: 0;
        z-index: 900;
        display: flex;
        align-items: center;
        justify-content: center;
        overflow-y: auto;
        padding: 20px 14px;
        box-sizing: border-box;
        background: rgba(8, 4, 6, 0.76);
        backdrop-filter: blur(5px);
        -webkit-backdrop-filter: blur(5px);
      }

      .quantityModal {
        width: 100%;
        max-width: 470px;
        margin: auto;
        padding: 28px 24px 22px;
        box-sizing: border-box;
        border: 1px solid rgba(201, 162, 39, 0.7);
        border-radius: 18px;
        background: var(--bg-panel);
        color: var(--ink);
        box-shadow: 0 24px 80px rgba(0, 0, 0, 0.5);
        text-align: center;
      }

      .quantityEyebrow {
        margin: 0 0 12px;
        color: var(--gold);
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.22em;
      }

      .quantityModal h2 {
        margin: 0;
        font-family: var(--font-display);
        font-size: clamp(24px, 5vw, 30px);
        font-weight: 500;
      }

      .quantitySubtitle {
        margin: 10px 0 22px;
        color: var(--ink-muted);
        font-size: 13px;
        line-height: 1.5;
      }

      /* Quantity buttons: 1, 2, 3, 4, 5 */

      .quantityOptions {
        display: flex;
        justify-content: center;
        gap: clamp(8px, 3vw, 15px);
      }

      .quantityOption {
        width: 42px;
        height: 42px;
        flex: 0 0 42px;
        border: 1px solid rgba(201, 162, 39, 0.4);
        border-radius: 50%;
        background: rgba(201, 162, 39, 0.06);
        color: var(--ink);
        font: inherit;
        font-size: 16px;
        cursor: pointer;
        transition:
          background 0.15s ease,
          border-color 0.15s ease,
          transform 0.15s ease;
      }

      .quantityOption:hover {
        border-color: var(--gold);
        transform: translateY(-1px);
      }

      .quantityOption.active {
        background: var(--gold);
        border-color: var(--gold-bright);
        color: #1a0f10;
        font-weight: 700;
      }

      /* Divider */

      .quantityDivider {
        height: 1px;
        margin: 24px 0 20px;
        background: rgba(201, 162, 39, 0.22);
      }

      /* Three ticket price tiers */

      .quantityPrices {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 5px;
      }

      .quantityPrice {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 5px;
        min-width: 0;
      }

      .quantityPrice span {
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.04em;
      }

      .quantityPrice strong {
        color: var(--ink);
        font-size: clamp(19px, 4vw, 23px);
        font-variant-numeric: tabular-nums;
      }

      .quantityPrice small {
        color: var(--ink-muted);
        font-size: 11px;
      }

      .premiumText span {
        color: #d9b45b;
      }

      .standardText span {
        color: #83a9d9;
      }

      .economyText span {
        color: #77b89a;
      }

      /* Pricing note */

      .quantityNote {
        margin: 19px 0;
        color: var(--ink-muted);
        font-size: 11px;
        line-height: 1.5;
      }

      /* Select Seats button */

      .quantityContinue {
        display: block;
        width: 100%;
        min-height: 48px;
        box-sizing: border-box;
        padding: 12px 16px;
        border: 1px solid var(--gold);
        border-radius: 9px;
        background: var(--gold);
        color: #1a0f10;
        font: inherit;
        font-size: 15px;
        font-weight: 700;
        cursor: pointer;
        transition: background 0.15s ease;
      }

      .quantityContinue:hover {
        background: var(--gold-bright);
      }

      .quantityContinue:focus-visible,
      .quantityOption:focus-visible {
        outline: 2px solid var(--gold-bright);
        outline-offset: 3px;
      }

      /* Mobile layout */

      @media (max-width: 480px) {
        .quantityOverlay {
          padding: 16px 12px;
        }

        .quantityModal {
          padding: 25px 17px 18px;
          border-radius: 15px;
        }

        .quantityOptions {
          gap: 10px;
        }

        .quantityOption {
          width: 39px;
          height: 39px;
          flex-basis: 39px;
        }

        .quantityDivider {
          margin: 20px 0 17px;
        }

        .quantityPrice span {
          font-size: 9px;
        }

        .quantityPrice small {
          font-size: 10px;
        }
      }


      @media (hover: none) {
        .seat:hover:not(.selected) {
          background: transparent;
          transform: none;
        }

        .seat.selected,
        .seat.selected:hover,
        .seat.selected:focus,
        .seat.selected:active {
          background: var(--gold-bright);
          border-color: var(--gold-bright);
        }
      }
      `}</style>
    </div>
  );
}