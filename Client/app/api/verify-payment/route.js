
import { NextResponse } from "next/server";
import Razorpay from "razorpay";
import { createHmac, timingSafeEqual } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

export async function POST(request) {
  try {
    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;

    if (!keyId || !keySecret) {
      return NextResponse.json(
        {
          success: false,
          message: "Payment gateway is not configured.",
        },
        { status: 500 }
      );
    }

    const body = await request.json();

    const {
      bookingId,
      razorpay_order_id: orderId,
      razorpay_payment_id: paymentId,
      razorpay_signature: signature,
    } = body;

    if (
      typeof bookingId !== "string" ||
      typeof orderId !== "string" ||
      typeof paymentId !== "string" ||
      typeof signature !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        bookingId
      ) ||
      !/^order_[A-Za-z0-9]+$/.test(orderId) ||
      !/^pay_[A-Za-z0-9]+$/.test(paymentId) ||
      !/^[a-f0-9]{64}$/i.test(signature)
    ) {
      return NextResponse.json(
        {
          success: false,
          message: "Invalid payment verification details.",
        },
        { status: 400 }
      );
    }

    // 1. Retrieve the booking.
    const { data: booking, error: bookingError } =
      await supabaseAdmin
        .from("bookings")
        .select(
          "id, show_id, quantity, amount_paise, status, razorpay_order_id, razorpay_payment_id"
        )
        .eq("id", bookingId)
        .maybeSingle();

    if (bookingError) {
      console.error("Booking lookup error:", bookingError.message);

      return NextResponse.json(
        {
          success: false,
          message: "Could not retrieve booking.",
        },
        { status: 500 }
      );
    }

    if (!booking || booking.razorpay_order_id !== orderId) {
      return NextResponse.json(
        {
          success: false,
          message: "Payment order does not match this booking.",
        },
        { status: 400 }
      );
    }

    if (!booking.show_id) {
      return NextResponse.json(
        {
          success: false,
          message: "This booking has no associated show.",
        },
        { status: 409 }
      );
    }


    // 2. Verify Razorpay's checkout signature.
    const expectedSignature = createHmac("sha256", keySecret)
      .update(orderId + "|" + paymentId)
      .digest();

    const receivedSignature = Buffer.from(signature, "hex");

    if (
      receivedSignature.length !== expectedSignature.length ||
      !timingSafeEqual(receivedSignature, expectedSignature)
    ) {
      return NextResponse.json(
        {
          success: false,
          message: "Payment signature verification failed.",
        },
        { status: 400 }
      );
    }


    // 3. Verify the total against the dynamically priced seats.
    const { data: claims, error: claimsError } = await supabaseAdmin
      .from("seat_claims")
      .select("seat_id, status, expires_at")
      .eq("booking_id", bookingId);

    if (claimsError) {
      console.error("Seat claim lookup error:", claimsError.message);

      return NextResponse.json(
        {
          success: false,
          message: "Could not verify the reserved seats.",
        },
        { status: 500 }
      );
    }

    const now = Date.now();

    const activeClaims = (claims ?? []).filter(
      (claim) =>
        claim.status === "booked" ||
        (claim.status === "reserved" &&
          claim.expires_at &&
          new Date(claim.expires_at).getTime() > now)
    );

    const uniqueSeatIds = new Set(
      activeClaims.map((claim) => claim.seat_id)
    );

    function getSeatPricePaise(seatId) {
      const match = /^([A-P])-(\d{1,2})$/.exec(seatId ?? "");

      if (!match) return null;

      const row = match[1];
      const seatNumber = Number(match[2]);

      if (["A", "B", "C", "D", "E", "L", "M", "N", "O"].includes(row)) {
        if (seatNumber < 1 || seatNumber > 14) return null;
      } else if (["F", "G", "H", "I", "J", "K"].includes(row)) {
        if (seatNumber < 1 || seatNumber > 12) return null;
      } else if (row === "P") {
        if (seatNumber < 1 || seatNumber > 17) return null;
      } else {
        return null;
      }

      if (["A", "B", "C", "D", "E"].includes(row)) return 7500;
      if (["F", "G", "H", "I", "J", "K"].includes(row)) return 5000;

      return 4000;
    }

    const seatPrices = activeClaims.map((claim) =>
      getSeatPricePaise(claim.seat_id)
    );

    if (
      activeClaims.length !== booking.quantity ||
      uniqueSeatIds.size !== booking.quantity ||
      seatPrices.some((price) => price === null)
    ) {
      return NextResponse.json(
        {
          success: false,
          message: "The reserved seats could not be validated.",
        },
        { status: 409 }
      );
    }

    const expectedTotalPaise = seatPrices.reduce(
      (total, price) => total + price,
      0
    );

    if (Number(booking.amount_paise) !== expectedTotalPaise) {
      console.error("Booking amount mismatch:", {
        bookingId,
        storedAmount: booking.amount_paise,
        expectedTotalPaise,
      });

      return NextResponse.json(
        {
          success: false,
          message: "The booking amount does not match the reserved seats.",
        },
        { status: 409 }
      );
    }

    // 4. Verify the payment directly with Razorpay.
    const razorpay = new Razorpay({
      key_id: keyId,
      key_secret: keySecret,
    });


    const payment = await razorpay.payments.fetch(paymentId);

    if (
      payment.order_id !== orderId ||
      payment.amount !== booking.amount_paise ||
      payment.currency !== "INR" ||
      payment.status !== "captured"
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Payment is not captured or does not match this booking.",
        },
        { status: 409 }
      );
    }

    // 4. Atomically finalize the booking and seats.
    const { data: finalized, error: finalizeError } =
      await supabaseAdmin.rpc("finalize_booking_payment", {
        p_booking_id: bookingId,
        p_order_id: orderId,
        p_payment_id: paymentId,
      });

    if (finalizeError) {
      console.error(
        "Finalize payment error:",
        finalizeError.message
      );

      return NextResponse.json(
        {
          success: false,
          message:
            "Payment was verified, but booking confirmation needs attention. Keep your payment ID for support.",
          bookingId,
          paymentId,
        },
        { status: 500 }
      );
    }

    if (finalized !== true) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Payment was verified, but the reservation could not be confirmed. Contact the event team with your payment ID.",
          bookingId,
          paymentId,
        },
        { status: 409 }
      );
    }

    // 5. Retrieve every ticket generated by the SQL function.
    const { data: tickets, error: ticketError } =
      await supabaseAdmin
        .from("tickets")
        .select(
          "id, booking_id, ticket_code, seat_id, created_at, barcode_token, show_id"
        )
        .eq("booking_id", bookingId)
        .eq("show_id", booking.show_id)
        .order("seat_id", { ascending: true });

    if (ticketError) {
      console.error("Ticket lookup error:", ticketError.message);

      return NextResponse.json(
        {
          success: false,
          bookingConfirmed: true,
          message:
            "Your booking is confirmed, but tickets could not be retrieved. Keep your payment ID and contact the event team.",
          bookingId,
          paymentId,
        },
        { status: 500 }
      );
    }

    // 6. Confirm that one ticket exists for every booked seat.
    if (!tickets || tickets.length !== booking.quantity) {
      console.error("Ticket count mismatch:", {
        bookingId,
        expected: booking.quantity,
        actual: tickets?.length ?? 0,
      });

      return NextResponse.json(
        {
          success: false,
          bookingConfirmed: true,
          message:
            "Your booking is confirmed, but the ticket count does not match the booking quantity. Contact the event team.",
          bookingId,
          paymentId,
          expectedTickets: booking.quantity,
          actualTickets: tickets?.length ?? 0,
        },
        { status: 500 }
      );
    }

    // 7. Return all tickets to the frontend.
    return NextResponse.json({
      success: true,
      message:
        "Payment verified, booking confirmed, and all tickets retrieved.",
      bookingId,
      paymentId,
      tickets: tickets.map((ticket) => ({
        id: ticket.id,
        ticketCode: ticket.ticket_code,
        seatId: ticket.seat_id,
        createdAt: ticket.created_at,
        barcodeToken: ticket.barcode_token,
      })),
    });
  } catch (error) {
    console.error("Verify payment error:", error);

    return NextResponse.json(
      {
        success: false,
        message:
          "Could not verify payment. Please retain your payment details.",
      },
      { status: 500 }
    );
  }
}