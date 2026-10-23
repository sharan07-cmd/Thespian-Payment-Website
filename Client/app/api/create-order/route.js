
import { NextResponse } from "next/server";
import Razorpay from "razorpay";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

// Prices are calculated in paise on the server.
// Keep these rules consistent with reserve_seats and seatLayout.js.
function getSeatPricePaise(seatId) {
  if (typeof seatId !== "string") return null;

  const match = seatId.match(/^([A-P])-(\d{1,2})$/);
  if (!match) return null;

  const [, row, numberText] = match;
  const seatNumber = Number(numberText);

  let maxSeats;

  if ("ABCDE".includes(row) || "LMNO".includes(row)) {
    maxSeats = 14;
  } else if ("FGHIJK".includes(row)) {
    maxSeats = 12;
  } else if (row === "P") {
    maxSeats = 17;
  } else {
    return null;
  }

  if (
    !Number.isInteger(seatNumber) ||
    seatNumber < 1 ||
    seatNumber > maxSeats
  ) {
    return null;
  }

  if ("ABCDE".includes(row)) return 7500; // ₹75
  if ("FGHIJK".includes(row)) return 5000; // ₹50
  return 4000; // ₹40: rows L-P
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

    const body = await request.json();
    const { bookingId } = body;

    if (
      typeof bookingId !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        bookingId
      )
    ) {
      return NextResponse.json(
        { success: false, message: "A valid booking ID is required." },
        { status: 400 }
      );
    }

    const { data: booking, error } = await supabaseAdmin
      .from("bookings")
      .select(
        "id, show_id, quantity, amount_paise, status, razorpay_order_id"
      )
      .eq("id", bookingId)
      .maybeSingle();

    if (error) {
      console.error("Booking lookup error:", error.message);

      return NextResponse.json(
        { success: false, message: "Could not retrieve booking." },
        { status: 500 }
      );
    }

    if (!booking) {
      return NextResponse.json(
        { success: false, message: "Booking not found." },
        { status: 404 }
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

    if (booking.status !== "pending") {
      return NextResponse.json(
        { success: false, message: "This booking is not payable." },
        { status: 409 }
      );
    }

    const { data: show, error: showError } = await supabaseAdmin
      .from("shows")
      .select("id, active")
      .eq("id", booking.show_id)
      .maybeSingle();

    if (showError) {
      console.error("Show lookup error:", showError.message);

      return NextResponse.json(
        {
          success: false,
          message: "Could not verify the selected show.",
        },
        { status: 500 }
      );
    }

    if (!show || !show.active) {
      return NextResponse.json(
        {
          success: false,
          message: "This show is unavailable for booking.",
        },
        { status: 409 }
      );
    }

    const { data: claims, error: claimsError } = await supabaseAdmin
      .from("seat_claims")
      .select("seat_id, status, expires_at, show_id")
      .eq("booking_id", bookingId)
      .eq("show_id", booking.show_id);

    if (claimsError) {
      console.error("Seat claim lookup error:", claimsError.message);

      return NextResponse.json(
        {
          success: false,
          message: "Could not verify seat reservation.",
        },
        { status: 500 }
      );
    }

    const activeClaims = (claims ?? []).filter(
      (claim) =>
        claim.status === "reserved" &&
        new Date(claim.expires_at).getTime() > Date.now()
    );

    if (
      !Number.isInteger(booking.quantity) ||
      booking.quantity < 1 ||
      booking.quantity > 5 ||
      activeClaims.length !== booking.quantity
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Your reservation has expired or is invalid. Please select your seats again.",
        },
        { status: 409 }
      );
    }

    // Ensure every reserved seat is unique and has a valid price.
    const seatIds = activeClaims.map((claim) => claim.seat_id);

    if (new Set(seatIds).size !== booking.quantity) {
      return NextResponse.json(
        {
          success: false,
          message: "Your seat reservation is invalid. Please select seats again.",
        },
        { status: 409 }
      );
    }

    let expectedTotalPaise = 0;

    for (const seatId of seatIds) {
      const seatPricePaise = getSeatPricePaise(seatId);

      if (seatPricePaise === null) {
        console.error("Invalid reserved seat ID:", seatId);

        return NextResponse.json(
          {
            success: false,
            message: "A selected seat is invalid. Please select seats again.",
          },
          { status: 409 }
        );
      }

      expectedTotalPaise += seatPricePaise;
    }

    // Never trust the amount supplied by the browser.
    if (
      !Number.isSafeInteger(expectedTotalPaise) ||
      Number(booking.amount_paise) !== expectedTotalPaise
    ) {
      console.error("Booking amount mismatch:", {
        bookingId: booking.id,
        storedAmountPaise: booking.amount_paise,
        expectedTotalPaise,
        seatIds,
      });

      return NextResponse.json(
        {
          success: false,
          message:
            "The ticket total could not be verified. Please start a new reservation.",
        },
        { status: 409 }
      );
    }

    const razorpay = new Razorpay({
      key_id: keyId,
      key_secret: keySecret,
    });

    // Reuse an existing order only if its amount matches the verified total.
    if (booking.razorpay_order_id) {
      const existingOrder = await razorpay.orders.fetch(
        booking.razorpay_order_id
      );

      if (
        existingOrder.amount === expectedTotalPaise &&
        existingOrder.currency === "INR" &&
        existingOrder.receipt === booking.id
      ) {
        return NextResponse.json({
          success: true,
          orderId: existingOrder.id,
          amount: existingOrder.amount,
          currency: existingOrder.currency,
          keyId,
          bookingId: booking.id,
        });
      }

      return NextResponse.json(
        {
          success: false,
          message:
            "The existing payment order could not be validated. Please contact support.",
        },
        { status: 409 }
      );
    }

    const order = await razorpay.orders.create({
      amount: expectedTotalPaise,
      currency: "INR",
      receipt: booking.id,
      notes: {
        booking_id: booking.id,
        show_id: booking.show_id,
        seat_ids: seatIds.join(","),
      },
    });

    // Link the order only if this booking is still pending and has no order.
    const { data: updatedBooking, error: updateError } =
      await supabaseAdmin
        .from("bookings")
        .update({ razorpay_order_id: order.id })
        .eq("id", booking.id)
        .eq("status", "pending")
        .is("razorpay_order_id", null)
        .select("id")
        .maybeSingle();

    if (updateError || !updatedBooking) {
      console.error(
        "Save Razorpay order error:",
        updateError?.message
      );

      return NextResponse.json(
        {
          success: false,
          message:
            "Could not link the payment order to your booking. Please try again.",
        },
        { status: 409 }
      );
    }

    return NextResponse.json({
      success: true,
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId,
      bookingId: booking.id,
    });
  } catch (error) {
    console.error("Create Razorpay order error:", error);

    return NextResponse.json(
      { success: false, message: "Could not create payment order." },
      { status: 500 }
    );
  }
}
