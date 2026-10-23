
import Razorpay from "razorpay";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

const isValidShowId = (showId) =>
  typeof showId === "string" &&
  ["show-1", "show-2"].includes(showId);

// Handles loading seat availability for a specific show.
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const showId = searchParams.get("showId");

    if (!isValidShowId(showId)) {
      return NextResponse.json(
        { error: "A valid showId is required." },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from("seat_claims")
      .select("seat_id, status, expires_at")
      .eq("show_id", showId);

    if (error) {
      console.error("Seat availability error:", error.message);

      return NextResponse.json(
        { error: "Could not load seat availability." },
        { status: 500 }
      );
    }

    const now = Date.now();

    const unavailableSeats = (data ?? [])
      .filter(
        (claim) =>
          claim.status === "booked" ||
          (claim.status === "reserved" &&
            new Date(claim.expires_at).getTime() > now)
      )
      .map((claim) => claim.seat_id);

    return NextResponse.json(
      { unavailableSeats },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("Seat API error:", error);

    return NextResponse.json(
      { error: "Could not load seat availability." },
      { status: 500 }
    );
  }
}

// Handles reserving seats for a specific show.
export async function POST(request) {
  try {
    const body = await request.json();
    const { showId, seats, quantity, name, email, phone } = body;

    if (!isValidShowId(showId)) {
      return NextResponse.json(
        { success: false, message: "A valid showId is required." },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin.rpc("reserve_seats", {
      p_show_id: showId,
      p_seat_ids: seats,
      p_quantity: quantity,
      p_customer_name: name,
      p_customer_email: email,
      p_customer_phone: phone,
    });

    if (error) {
      console.error("Seat reservation error:", error.message);

      const isUnavailable = error.message?.includes("SEAT_UNAVAILABLE");

      return NextResponse.json(
        {
          success: false,
          message: isUnavailable
            ? "One or more selected seats are no longer available. Please refresh and try again."
            : error.message,
        },
        { status: isUnavailable ? 409 : 400 }
      );
    }

    const reservation = Array.isArray(data) ? data[0] : data;

    if (
      !reservation?.booking_id ||
      !reservation?.release_token ||
      !reservation?.expires_at
    ) {
      console.error("Incomplete reservation response:", data);

      return NextResponse.json(
        {
          success: false,
          message: "Reservation details were incomplete. Please try again.",
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      reservation: {
        ...reservation,
        show_id: showId,
        total_paise: Number(reservation.total_paise),
      },
    });
  } catch (error) {
    console.error("Seat reservation API error:", error);

    return NextResponse.json(
      { success: false, message: "Internal server error." },
      { status: 500 }
    );
  }
}

// Releases an abandoned reservation after verifying its payment state.
export async function DELETE(request) {
  try {
    const { bookingId, releaseToken } = await request.json();

    const uuidPattern =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    if (
      typeof bookingId !== "string" ||
      !uuidPattern.test(bookingId) ||
      typeof releaseToken !== "string" ||
      !uuidPattern.test(releaseToken)
    ) {
      return NextResponse.json(
        {
          success: false,
          message: "Valid booking ID and release token are required.",
        },
        { status: 400 }
      );
    }

    const { data: booking, error: bookingError } = await supabaseAdmin
      .from("bookings")
      .select("id, status, release_token, razorpay_order_id")
      .eq("id", bookingId)
      .maybeSingle();

    if (bookingError) {
      console.error("Booking lookup error:", bookingError.message);

      return NextResponse.json(
        { success: false, message: "Could not verify booking." },
        { status: 500 }
      );
    }

    if (!booking || booking.release_token !== releaseToken) {
      return NextResponse.json(
        { success: false, message: "Invalid booking or release token." },
        { status: 403 }
      );
    }

    if (booking.status !== "pending") {
      return NextResponse.json({
        success: true,
        released: false,
        message: "This booking is no longer pending.",
      });
    }

    // Never release a reservation while payment may be in progress.
    if (booking.razorpay_order_id) {
      const keyId = process.env.RAZORPAY_KEY_ID;
      const keySecret = process.env.RAZORPAY_KEY_SECRET;

      if (!keyId || !keySecret) {
        return NextResponse.json(
          {
            success: false,
            message: "Payment verification is unavailable.",
          },
          { status: 500 }
        );
      }

      try {
        const razorpay = new Razorpay({
          key_id: keyId,
          key_secret: keySecret,
        });

        const [order, paymentsResponse] = await Promise.all([
          razorpay.orders.fetch(booking.razorpay_order_id),
          razorpay.orders.fetchPayments(booking.razorpay_order_id),
        ]);

        const payments = paymentsResponse.items ?? [];

        const paymentInProgressOrSuccessful = payments.some((payment) =>
          ["created", "authorized", "captured"].includes(payment.status)
        );

        if (
          order.status !== "created" ||
          paymentInProgressOrSuccessful
        ) {
          return NextResponse.json({
            success: true,
            released: false,
            message:
              "Payment may be in progress. The reservation was kept for verification.",
          });
        }
      } catch (error) {
        console.error("Razorpay payment-state lookup failed:", error);

        return NextResponse.json(
          {
            success: false,
            released: false,
            message:
              "Could not verify payment status. The reservation was kept.",
          },
          { status: 503 }
        );
      }
    }

    const { data, error } = await supabaseAdmin.rpc(
      "release_abandoned_booking",
      {
        p_booking_id: bookingId,
        p_release_token: releaseToken,
      }
    );

    if (error) {
      console.error("Release reservation error:", error.message);

      return NextResponse.json(
        { success: false, message: "Could not release reservation." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: data === true,
      released: data === true,
      message:
        data === true
          ? "Reservation released successfully."
          : "Reservation could not be released.",
    });
  } catch (error) {
    console.error("Release reservation error:", error);

    return NextResponse.json(
      { success: false, message: "Internal server error." },
      { status: 500 }
    );
  }
}