
import { NextResponse } from "next/server";
import Razorpay from "razorpay";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

function getSeatPricePaise(seatId) {
  const match = /^([A-P])-(\d{1,2})$/.exec(seatId);

  if (!match) return null;

  const [, row, numberText] = match;
  const number = Number(numberText);

  if (!Number.isInteger(number) || number < 1) return null;

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

  if (number > maxSeats) return null;

  if (row === "A") {
    // A-1 through A-14 are unavailable for show-1.
    return 7500;
  }

  if ("BCDE".includes(row)) return 7500;
  if ("FGHIJK".includes(row)) return 5000;

  return 4000;
}

function errorResponse(message, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request) {
  try {
    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;

    if (!keyId || !keySecret) {
      console.error("Razorpay environment variables are missing.");
      return errorResponse("Payment service is not configured.", 500);
    }

    let body;

    try {
      body = await request.json();
    } catch {
      return errorResponse("Invalid request body.");
    }

    const bookingId = body?.bookingId;

    if (
      typeof bookingId !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        bookingId
      )
    ) {
      return errorResponse("Invalid booking ID.");
    }

    // 1. Load the booking.
    const { data: booking, error: bookingError } =
      await supabaseAdmin
        .from("bookings")
        .select(
          "id, show_id, quantity, amount_paise, status, payment_status, razorpay_order_id"
        )
        .eq("id", bookingId)
        .maybeSingle();

    if (bookingError) {
      console.error("Booking lookup failed:", bookingError);
      return errorResponse("Could not verify your booking.", 500);
    }

    if (!booking) {
      return errorResponse("Booking not found.", 404);
    }

    if (booking.status !== "pending") {
      return errorResponse(
        "This booking is no longer pending. Please start a new booking.",
        409
      );
    }

    if (
      booking.payment_status &&
      booking.payment_status !== "unpaid"
    ) {
      return errorResponse(
        "This booking has a payment status that requires verification.",
        409
      );
    }

    if (
      !Number.isInteger(booking.quantity) ||
      booking.quantity < 1 ||
      booking.quantity > 5 ||
      !Number.isInteger(booking.amount_paise) ||
      booking.amount_paise <= 0
    ) {
      return errorResponse("The booking details are invalid.", 409);
    }

    // 2. Confirm that the show exists and is active.
    const { data: show, error: showError } = await supabaseAdmin
      .from("shows")
      .select("id, active")
      .eq("id", booking.show_id)
      .maybeSingle();

    if (showError) {
      console.error("Show lookup failed:", showError);
      return errorResponse("Could not verify the show.", 500);
    }

    if (!show || show.active !== true) {
      return errorResponse(
        "This show is not currently available for booking.",
        409
      );
    }

    // 3. Load the permanent seat selection saved when the
    // reservation was created.
    const { data: savedSeats, error: savedSeatsError } =
      await supabaseAdmin
        .from("booking_seats")
        .select("seat_id, seat_price_paise")
        .eq("booking_id", bookingId)
        .eq("show_id", booking.show_id);

    if (savedSeatsError) {
      console.error("Saved seat lookup failed:", savedSeatsError);
      return errorResponse("Could not verify the selected seats.", 500);
    }

    if (
      !savedSeats ||
      savedSeats.length !== booking.quantity ||
      new Set(savedSeats.map((seat) => seat.seat_id)).size !==
        booking.quantity
    ) {
      return errorResponse(
        "The saved seats do not match this booking. Please start a new booking.",
        409
      );
    }

    // 4. Recalculate prices on the server and validate the saved total.
    let expectedTotalPaise = 0;

    for (const seat of savedSeats) {
      const expectedSeatPrice = getSeatPricePaise(seat.seat_id);

      if (
        expectedSeatPrice === null ||
        !Number.isInteger(seat.seat_price_paise) ||
        seat.seat_price_paise !== expectedSeatPrice
      ) {
        return errorResponse(
          "One or more selected seats have invalid pricing.",
          409
        );
      }

      if (booking.show_id === "show-1" && seat.seat_id.startsWith("A-")) {
        return errorResponse(
          "Row A is unavailable for this show. Please select other seats.",
          409
        );
      }

      expectedTotalPaise += expectedSeatPrice;
    }

    if (booking.amount_paise !== expectedTotalPaise) {
      return errorResponse(
        "The booking total does not match the selected seats.",
        409
      );
    }

    // 5. Verify that every saved seat is still actively reserved
    // by this booking.
    const { data: claims, error: claimsError } = await supabaseAdmin
      .from("seat_claims")
      .select("seat_id, status, expires_at")
      .eq("booking_id", bookingId)
      .eq("show_id", booking.show_id);

    if (claimsError) {
      console.error("Seat claim lookup failed:", claimsError);
      return errorResponse("Could not verify your seat reservation.", 500);
    }

    const now = Date.now();

    const activeClaims = (claims || []).filter(
      (claim) =>
        claim.status === "reserved" &&
        claim.expires_at &&
        new Date(claim.expires_at).getTime() > now
    );

    const savedSeatIds = savedSeats
      .map((seat) => seat.seat_id)
      .sort();

    const claimedSeatIds = activeClaims
      .map((claim) => claim.seat_id)
      .sort();

    if (
      activeClaims.length !== booking.quantity ||
      savedSeatIds.some((seatId, index) => seatId !== claimedSeatIds[index])
    ) {
      return errorResponse(
        "Your seat reservation has expired or changed. Please select your seats again.",
        409
      );
    }

    // 6. Only now interact with Razorpay.
    const razorpay = new Razorpay({
      key_id: keyId,
      key_secret: keySecret,
    });

    // Reuse an existing order only if it matches this booking.
    if (booking.razorpay_order_id) {
      let existingOrder;

      try {
        existingOrder = await razorpay.orders.fetch(
          booking.razorpay_order_id
        );
      } catch (error) {
        console.error("Existing Razorpay order lookup failed:", error);
        return errorResponse(
          "Could not verify the existing payment order. Please contact support before retrying.",
          502
        );
      }

      if (
        existingOrder.id !== booking.razorpay_order_id ||
        existingOrder.amount !== expectedTotalPaise ||
        existingOrder.currency !== "INR" ||
        existingOrder.receipt !== bookingId
      ) {
        console.error("Razorpay order does not match booking:", {
          bookingId,
          orderId: booking.razorpay_order_id,
        });

        return errorResponse(
          "The existing payment order does not match this booking.",
          409
        );
      }

      if (
        existingOrder.status !== "created" &&
        existingOrder.status !== "attempted"
      ) {
        return errorResponse(
          "This payment order is no longer payable. Please verify its payment status before creating another booking.",
          409
        );
      }

      return NextResponse.json({
        orderId: existingOrder.id,
        amount: existingOrder.amount,
        currency: existingOrder.currency,
        keyId,
        bookingId,
      });
    }

    // 7. Create a new order only after all booking validations pass.
    let order;

    try {
      order = await razorpay.orders.create({
        amount: expectedTotalPaise,
        currency: "INR",
        receipt: bookingId,
        notes: {
          booking_id: bookingId,
          show_id: booking.show_id,
          seat_ids: savedSeatIds.join(","),
        },
      });
    } catch (error) {
      console.error("Razorpay order creation failed:", error);
      return errorResponse(
        "Could not create the payment order. Please try again.",
        502
      );
    }

    // 8. Attach the order to the booking only if another request
    // has not already attached an order.
    const { data: updatedBooking, error: updateError } =
      await supabaseAdmin
        .from("bookings")
        .update({ razorpay_order_id: order.id })
        .eq("id", bookingId)
        .eq("status", "pending")
        .is("razorpay_order_id", null)
        .select("id, razorpay_order_id")
        .maybeSingle();

    if (updateError) {
      console.error("Saving Razorpay order ID failed:", updateError);
      return errorResponse(
        "The payment order was created, but we could not confirm your booking. Please do not retry payment; contact support.",
        500
      );
    }

    if (!updatedBooking) {
      // Another request may have attached an order while this one
      // was being created. Do not return an unlinked order to the client.
      const { data: latestBooking, error: latestError } =
        await supabaseAdmin
          .from("bookings")
          .select("razorpay_order_id, status")
          .eq("id", bookingId)
          .maybeSingle();

      if (latestError) {
        console.error("Rechecking booking after order race failed:", latestError);
      }

      console.error("Razorpay order was not attached to booking:", {
        bookingId,
        createdOrderId: order.id,
        existingOrderId: latestBooking?.razorpay_order_id,
      });

      return errorResponse(
        "Your payment order could not be safely linked to the booking. Please check your booking status before retrying.",
        409
      );
    }

    return NextResponse.json({
      orderId: order.id,
      amount: expectedTotalPaise,
      currency: "INR",
      keyId,
      bookingId,
    });
  } catch (error) {
    console.error("Unexpected create-order error:", error);
    return errorResponse("An unexpected payment error occurred.", 500);
  }
}
