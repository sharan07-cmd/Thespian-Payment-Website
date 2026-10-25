
import { NextResponse } from "next/server";
import Razorpay from "razorpay";
import { createHmac, timingSafeEqual } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

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

    let body;

    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, message: "Invalid request body." },
        { status: 400 }
      );
    }

    const {
      bookingId,
      razorpay_order_id: orderId,
      razorpay_payment_id: paymentId,
      razorpay_signature: signature,
    } = body ?? {};

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

    // 1. Retrieve the booking and verify its order.
    const { data: booking, error: bookingError } = await supabaseAdmin
      .from("bookings")
      .select(
        "id, show_id, quantity, amount_paise, status, payment_status, razorpay_order_id, razorpay_payment_id"
      )
      .eq("id", bookingId)
      .maybeSingle();

    if (bookingError) {
      console.error("Booking lookup error:", bookingError.message);

      return NextResponse.json(
        { success: false, message: "Could not retrieve booking." },
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
        { success: false, message: "This booking has no associated show." },
        { status: 409 }
      );
    }

    // 2. Verify Razorpay's checkout signature.
    const expectedSignature = createHmac("sha256", keySecret)
      .update(`${orderId}|${paymentId}`)
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

    // 3. Verify the payment directly with Razorpay BEFORE checking
    // reservation expiry. An expired reservation does not undo a capture.
    const razorpay = new Razorpay({
      key_id: keyId,
      key_secret: keySecret,
    });

    let payment;

try {
  payment = await razorpay.payments.fetch(paymentId);
} catch (error) {
  console.error("Razorpay payment lookup failed:", {
    bookingId,
    orderId,
    paymentId,
    error: error?.message,
  });

  return NextResponse.json(
    {
      success: false,
      message:
        "Could not confirm the payment with Razorpay. If money was deducted, do not pay again; retry verification or contact the event team.",
      bookingId,
      paymentId,
      retryVerification: true,
    },
    { status: 502 }
  );
}

    if (
      payment.order_id !== orderId ||
      Number(payment.amount) !== Number(booking.amount_paise) ||
      payment.currency !== "INR" ||
      payment.status !== "captured"
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Razorpay has not confirmed a captured payment matching this booking.",
        },
        { status: 409 }
      );
    }

    // 4. Validate the permanent seat selection, not expiring seat claims.
    const {
      data: savedSeats,
      error: savedSeatsError,
    } = await supabaseAdmin
      .from("booking_seats")
      .select("seat_id, seat_price_paise")
      .eq("booking_id", bookingId)
      .eq("show_id", booking.show_id)
      .order("seat_id", { ascending: true });

    if (savedSeatsError) {
      console.error("Saved seat lookup error:", savedSeatsError.message);

      return NextResponse.json(
        {
          success: false,
          message:
            "Payment was captured, but the saved seat selection could not be checked. Contact the event team with your payment ID.",
          bookingId,
          paymentId,
        },
        { status: 500 }
      );
    }

    const seats = savedSeats ?? [];
    const uniqueSeatIds = new Set(seats.map((seat) => seat.seat_id));

    const invalidPrice = seats.some((seat) => {
      const expectedPrice = getSeatPricePaise(seat.seat_id);

      return (
        expectedPrice === null ||
        Number(seat.seat_price_paise) !== expectedPrice ||
        (booking.show_id === "show-1" && seat.seat_id.startsWith("A-"))
      );
    });

    const expectedTotalPaise = seats.reduce(
      (total, seat) => total + Number(seat.seat_price_paise),
      0
    );

    if (
      seats.length !== Number(booking.quantity) ||
      uniqueSeatIds.size !== Number(booking.quantity) ||
      invalidPrice ||
      expectedTotalPaise !== Number(booking.amount_paise)
    ) {
      console.error("Saved seat validation failed:", {
        bookingId,
        savedSeatCount: seats.length,
        expectedQuantity: booking.quantity,
        savedTotalPaise: expectedTotalPaise,
        bookingAmountPaise: booking.amount_paise,
      });

      return NextResponse.json(
        {
          success: false,
          message:
            "Payment was captured, but the original seat selection could not be validated. Contact the event team with your payment ID.",
          bookingId,
          paymentId,
        },
        { status: 409 }
      );
    }

    // 5. Atomically finalize the booking, recover safe claims, and create tickets.
    const { data: finalized, error: finalizeError } =
      await supabaseAdmin.rpc("finalize_booking_payment", {
        p_booking_id: bookingId,
        p_order_id: orderId,
        p_payment_id: paymentId,
      });

    if (finalizeError) {
      console.error("Finalize payment error:", finalizeError.message);

      return NextResponse.json(
        {
          success: false,
          message:
            "Payment was captured, but booking confirmation needs attention. Keep your payment ID for support.",
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
            "Payment was captured, but the seats could not be safely confirmed. Contact the event team with your payment ID. Do not pay again.",
          bookingId,
          paymentId,
        },
        { status: 409 }
      );
    }

    // 6. Retrieve the tickets created by the SQL function.
    const { data: tickets, error: ticketError } = await supabaseAdmin
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

    if (!tickets || tickets.length !== Number(booking.quantity)) {
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
            "Your booking is confirmed, but the ticket count needs attention. Contact the event team.",
          bookingId,
          paymentId,
          expectedTickets: booking.quantity,
          actualTickets: tickets?.length ?? 0,
        },
        { status: 500 }
      );
    }

    // 7. Return tickets to the frontend.
    return NextResponse.json({
      success: true,
      message: "Payment verified, booking confirmed, and tickets retrieved.",
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
          "Could not complete payment verification. If money was deducted, do not pay again; retain your payment ID and contact the event team.",
      },
      { status: 500 }
    );
  }
}
