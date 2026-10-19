import Razorpay from "razorpay";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

// Handles loading the seat map
export async function GET() {
  try {
    const { data, error } = await supabaseAdmin
      .from("seat_claims")
      .select("seat_id, status, expires_at");

    if (error) {
      console.error("Seat availability error:", error.message);

      return NextResponse.json(
        { error: "Could not load seat availability" },
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
      { error: "Could not load seat availability" },
      { status: 500 }
    );
  }
}

// Handles reserving seats
export async function POST(request) {
  try {
    const body = await request.json();
    const { seats, quantity, name, email, phone } = body;

    const { data, error } = await supabaseAdmin.rpc("reserve_seats", {
      p_seat_ids: seats,
      p_quantity: quantity,
      p_customer_name: name,
      p_customer_email: email,
      p_customer_phone: phone,
    });

    if (error) {
      console.error("Seat reservation error:", error.message);

      return NextResponse.json(
        { success: false, message: error.message },
        { status: 400 }
      );
    }

    // Supabase RPC may return an array of rows or a single object.
    const reservation = Array.isArray(data) ? data[0] : data;

    // Diagnostic logs: inspect the actual response in your terminal.
    console.log(
      "Supabase reservation data:",
      JSON.stringify(data, null, 2)
    );
    console.log(
      "Reservation object:",
      JSON.stringify(reservation, null, 2)
    );

    if (
      !reservation?.booking_id ||
      !reservation?.release_token ||
      !reservation?.expires_at
    ) {
      console.error("Reservation response is missing required fields.");

      return NextResponse.json(
        {
          success: false,
          message:
            "Reservation details were incomplete. Please try again.",
        },
        { status: 500 }
      );
    }

    // Return the reservation in the format expected by the checkout.
    return NextResponse.json({
      success: true,
      reservation: {
        ...reservation,
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

    // Retrieve the booking and verify the release token.
    const { data: booking, error: bookingError } =
      await supabaseAdmin
        .from("bookings")
        .select(
          "id, status, release_token, razorpay_order_id"
        )
        .eq("id", bookingId)
        .maybeSingle();

    if (bookingError) {
      console.error("Booking lookup error:", bookingError.message);

      return NextResponse.json(
        { success: false, message: "Could not verify booking." },
        { status: 500 }
      );
    }

    if (
      !booking ||
      booking.release_token !== releaseToken
    ) {
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

    // Do not release seats if a Razorpay order exists.
    // Payment status must be verified before releasing them.
    
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

        // Never release if the order is paid or payment
        // is created, authorized, or captured.
        const paymentInProgressOrSuccessful = payments.some(
          (payment) =>
            ["created", "authorized", "captured"].includes(
              payment.status
            )
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
