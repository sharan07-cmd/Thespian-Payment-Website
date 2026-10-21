
import { NextResponse } from "next/server";
import Razorpay from "razorpay";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

export async function POST(request) {
  try {
    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;

    if (!keyId || !keySecret) {
      return NextResponse.json(
        { success: false, message: "Payment gateway is not configured." },
        { status: 500 }
      );
    }

    const body = await request.json();
    const { bookingId } = body;

    if (
      typeof bookingId !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(bookingId)
    ) {
      return NextResponse.json(
        { success: false, message: "A valid booking ID is required." },
        { status: 400 }
      );
    }

    const { data: booking, error } = await supabaseAdmin
      .from("bookings")
      .select("id, quantity, amount_paise, status, razorpay_order_id")
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

    if (booking.status !== "pending") {
      return NextResponse.json(
        { success: false, message: "This booking is not payable." },
        { status: 409 }
      );
    }

    const { data: claims, error: claimsError } = await supabaseAdmin
      .from("seat_claims")
      .select("seat_id, status, expires_at")
      .eq("booking_id", bookingId);

    if (claimsError) {
      console.error("Seat claim lookup error:", claimsError.message);
      return NextResponse.json(
        { success: false, message: "Could not verify seat reservation." },
        { status: 500 }
      );
    }

    const activeClaims = (claims ?? []).filter(
      (claim) =>
        claim.status === "reserved" &&
        new Date(claim.expires_at).getTime() > Date.now()
    );

    if (
      activeClaims.length !== booking.quantity ||
      !Number.isInteger(booking.quantity) ||
      booking.quantity < 1 ||
      booking.quantity > 5 ||
      booking.amount_paise !== booking.quantity * 5000
    ) {
      return NextResponse.json(
        {
          success: false,
          message: "Your reservation has expired or is invalid. Please select your seats again.",
        },
        { status: 409 }
      );
    }

    // Reuse an order already saved for this booking.
    if (booking.razorpay_order_id) {
      const razorpay = new Razorpay({
        key_id: keyId,
        key_secret: keySecret,
      });

      const existingOrder = await razorpay.orders.fetch(
        booking.razorpay_order_id
      );

      if (
        existingOrder.amount === booking.amount_paise &&
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
        { success: false, message: "The existing payment order could not be validated." },
        { status: 409 }
      );
    }

    const razorpay = new Razorpay({
      key_id: keyId,
      key_secret: keySecret,
    });

    const order = await razorpay.orders.create({
      amount: booking.amount_paise,
      currency: "INR",
      receipt: booking.id,
      notes: { booking_id: booking.id },
    });

    // Save the order ID only while the booking remains pending.
    const { data: updatedBooking, error: updateError } = await supabaseAdmin
      .from("bookings")
      .update({ razorpay_order_id: order.id })
      .eq("id", booking.id)
      .eq("status", "pending")
      .is("razorpay_order_id", null)
      .select("id")
      .maybeSingle();

    if (updateError || !updatedBooking) {
      console.error("Save Razorpay order error:", updateError?.message);
      return NextResponse.json(
        {
          success: false,
          message: "Could not link the payment order to your booking. Please try again.",
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
