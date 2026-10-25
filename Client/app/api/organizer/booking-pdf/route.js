
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { jsPDF } from "jspdf";
import QRCode from "qrcode";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

function errorResponse(message, status) {
  return NextResponse.json(
    { success: false, error: message },
    {
      status,
      headers: { "Cache-Control": "no-store" },
    }
  );
}

function formatShowSubtitle(show) {
  const date = new Date(`${show.show_date}T00:00:00Z`);
  const dateText = date.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });

  const [hoursText, minutesText = "00"] = String(
    show.show_time || "18:00:00"
  ).split(":");

  const hours = Number(hoursText);
  const timeText = `${hours % 12 || 12}:${minutesText} ${
    hours >= 12 ? "PM" : "AM"
  }`;

  return `${dateText}, ${timeText} · ${show.venue || "Venue TBA"}`;
}

export async function GET(request) {
  try {
    // 1. Verify the logged-in user.
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return errorResponse("Please log in first.", 401);
    }

    // 2. Verify active staff permissions.
    const { data: staff, error: staffError } = await supabaseAdmin
      .from("organizer_staff")
      .select("user_id, role, active")
      .eq("user_id", user.id)
      .eq("active", true)
      .in("role", ["organizer", "entry_staff"])
      .maybeSingle();

    if (staffError) {
      console.error("Booking PDF staff lookup failed:", staffError);
      return errorResponse("Could not verify staff permissions.", 500);
    }

    if (!staff) {
      return errorResponse(
        "You are not authorised to download tickets.",
        403
      );
    }

    // 3. Validate the booking ID and show ID.
    const { searchParams } = new URL(request.url);
    const bookingId = searchParams.get("bookingId")?.trim();
    const showId = searchParams.get("showId");

    const uuidPattern =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    if (!bookingId || !uuidPattern.test(bookingId)) {
      return errorResponse("Enter a valid booking ID.", 400);
    }

    if (!["show-1", "show-2"].includes(showId)) {
      return errorResponse("Select a valid show.", 400);
    }

    // 4. Retrieve this booking for the selected show only.
    const { data: booking, error: bookingError } = await supabaseAdmin
      .from("bookings")
      .select(
        "id, quantity, customer_name, customer_email, customer_phone, status, payment_status, show_id"
      )
      .eq("id", bookingId)
      .eq("show_id", showId)
      .maybeSingle();

    if (bookingError) {
      console.error("Booking PDF booking lookup failed:", bookingError);
      return errorResponse("Could not retrieve this booking.", 500);
    }

    if (!booking) {
      return errorResponse(
        "No booking was found for this ID and selected show.",
        404
      );
    }

    // 5. Require confirmed payment.
    if (
      booking.status !== "paid" ||
      booking.payment_status !== "paid"
    ) {
      return errorResponse(
        "Payment is not confirmed for this booking.",
        409
      );
    }

    // 6. Retrieve the tickets belonging to this booking and show.
    const { data: tickets, error: ticketsError } = await supabaseAdmin
      .from("tickets")
      .select("id, ticket_code, seat_id, barcode_token, booking_id, show_id")
      .eq("booking_id", booking.id)
      .eq("show_id", showId)
      .order("created_at", { ascending: true });

    if (ticketsError) {
      console.error("Booking PDF ticket lookup failed:", ticketsError);
      return errorResponse("Could not retrieve the tickets.", 500);
    }

    if (!tickets || tickets.length === 0) {
      return errorResponse("No tickets exist for this booking.", 404);
    }

    if (tickets.some((ticket) => !ticket.barcode_token)) {
      return errorResponse(
        "A ticket is missing its QR verification token.",
        409
      );
    }

    // 7. Retrieve the show details.
    const { data: show, error: showError } = await supabaseAdmin
      .from("shows")
      .select("id, show_date, show_time, venue")
      .eq("id", showId)
      .maybeSingle();

    if (showError || !show) {
      console.error("Booking PDF show lookup failed:", showError);
      return errorResponse("Could not retrieve show details.", 500);
    }

    const eventTitle = "Ponniyin Selvan: Karikala Yugam";
    const eventSubtitle = formatShowSubtitle(show);

    const siteOrigin = (
      process.env.NEXT_PUBLIC_SITE_URL ||
      new URL(request.url).origin
    ).replace(/\/+$/, "");

    // 8. Create the PDF, one landscape A4 page per ticket.
    const doc = new jsPDF("landscape", "mm", "a4");
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();

    const gold = [218, 178, 76];
    const paleGold = [255, 226, 145];
    const black = [13, 12, 9];
    const white = [255, 250, 235];
    const muted = [192, 181, 151];

    for (const [index, ticket] of tickets.entries()) {
      if (index > 0) doc.addPage("a4", "landscape");

      const code = String(ticket.ticket_code || "N/A");
      const seatId = String(ticket.seat_id || "N/A");

      const scanUrl = new URL("/organizer/scan", siteOrigin);
      scanUrl.searchParams.set("token", ticket.barcode_token);

      const qrDataUrl = await QRCode.toDataURL(scanUrl.toString(), {
        width: 320,
        margin: 2,
        errorCorrectionLevel: "M",
      });

      // Background and frame.
      doc.setFillColor(18, 17, 13);
      doc.rect(0, 0, pageWidth, pageHeight, "F");

      doc.setDrawColor(...gold);
      doc.setLineWidth(0.6);
      doc.roundedRect(7, 7, pageWidth - 14, pageHeight - 14, 3, 3, "S");

      // Main ticket.
      const x = 22;
      const y = 32;
      const w = 253;
      const h = 108;
      const stubW = 43;

      doc.setFillColor(5, 5, 4);
      doc.roundedRect(x + 2, y + 2, w, h, 3, 3, "F");

      doc.setFillColor(...black);
      doc.setDrawColor(...gold);
      doc.setLineWidth(1);
      doc.roundedRect(x, y, w, h, 3, 3, "FD");

      // Gold stub.
      doc.setFillColor(202, 160, 52);
      doc.setDrawColor(...paleGold);
      doc.roundedRect(x, y, stubW, h, 3, 3, "FD");

      doc.setFillColor(202, 160, 52);
      doc.rect(x + stubW - 3, y + 1, 4, h - 2, "F");

      // Perforation.
      doc.setDrawColor(91, 69, 26);
      doc.setLineWidth(0.5);

      for (let py = y + 4; py < y + h - 4; py += 5) {
        doc.line(x + stubW, py, x + stubW + 2, py + 2.5);
      }

      // Stub text.
      doc.setFont("helvetica", "bold");
      doc.setFontSize(6);
      doc.setTextColor(20, 16, 7);
      doc.text("ADMIT ONE", x + stubW / 2, y + 91, {
        align: "center",
      });

      // Main ticket content.
      const contentX = x + stubW + 8;
      const contentRight = x + w - 8;
      const contentW = contentRight - contentX;
      const centerX = (contentX + contentRight) / 2;

      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(...paleGold);
      doc.text("T H E S P I A N   T I C K E T S", centerX, y + 13, {
        align: "center",
      });

      doc.setDrawColor(...gold);
      doc.setLineWidth(0.4);
      doc.line(contentX + 5, y + 18, contentRight - 5, y + 18);

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

      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.setTextColor(...white);
      doc.text("THEATRE TICKET", centerX, y + 50, {
        align: "center",
      });

      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(...muted);

      const subtitleLines = doc
        .splitTextToSize(eventSubtitle, contentW - 12)
        .slice(0, 2);

      doc.text(subtitleLines, centerX, y + 56, {
        align: "center",
        lineHeightFactor: 1.2,
      });

      // Confirmation strip.
      doc.setFillColor(202, 160, 52);
      doc.roundedRect(centerX - 34, y + 66, 68, 9, 1.5, 1.5, "F");

      doc.setFont("helvetica", "bold");
      doc.setFontSize(7);
      doc.setTextColor(20, 17, 10);
      doc.text("BOOKING CONFIRMED", centerX, y + 72, {
        align: "center",
      });

      // Seat.
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.setTextColor(...muted);
      doc.text("RESERVED SEAT", contentX + 5, y + 85);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(14);
      doc.setTextColor(...paleGold);
      doc.text(seatId, contentX + 5, y + 95);

      // QR code.
      const qrSize = 25;
      const qrX = x + (stubW - qrSize) / 2;
      const qrY = y + 20;

      doc.addImage(qrDataUrl, "PNG", qrX, qrY, qrSize, qrSize);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(5.5);
      doc.setTextColor(20, 16, 7);
      doc.text("SCAN TO VERIFY", qrX + qrSize / 2, qrY + qrSize + 8, {
        align: "center",
      });

      doc.setFontSize(7);
      doc.setTextColor(...white);
      doc.text(
        `TICKET ${index + 1} OF ${tickets.length}`,
        contentRight - 5,
        y + 101,
        { align: "right" }
      );

      // Ticket code and booking reference.
      doc.setDrawColor(...gold);
      doc.setLineWidth(0.4);
      doc.line(25, 151, pageWidth - 25, 151);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(7);
      doc.setTextColor(...gold);
      doc.text("TICKET CODE", 27, 163);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(...white);
      doc.text(doc.splitTextToSize(code, 105).slice(0, 2), 27, 171);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(...gold);
      doc.text("BOOKING REFERENCE", 160, 163);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(...white);
      doc.text(
        doc.splitTextToSize(String(booking.id), 105).slice(0, 2),
        160,
        171
      );

      // Footer.
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

    const pdfBuffer = doc.output("arraybuffer");
    const safeBookingId = booking.id.replace(/[^a-zA-Z0-9-]/g, "");

    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="THESPIAN-TICKETS-${safeBookingId}.pdf"`,
        "Cache-Control": "private, no-store, max-age=0",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("Unexpected booking PDF error:", error);
    return errorResponse(
      "An unexpected error occurred while generating the PDF.",
      500
    );
  }
}
