import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import crypto from "crypto";

export async function POST(request) {
  const body = await request.text();
  const signature = request.headers.get("x-razorpay-signature");

  // Verify the webhook is actually from Razorpay
  const expectedSignature = crypto
    .createHmac("sha256", process.env.RAZORPAY_WEBHOOK_SECRET)
    .update(body)
    .digest("hex");

  if (expectedSignature !== signature) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const event = JSON.parse(body);

  // If payment fails, release the seat claim immediately
  if (event.event === "payment.failed") {
    const razorpayOrderId = event.payload.payment.entity.order_id;

    // Look up the booking ID using the Razorpay order ID
    const { data: booking } = await supabaseAdmin
      .from("bookings")
      .select("id")
      .eq("razorpay_order_id", razorpayOrderId)
      .single();

    if (booking) {
      // Delete the specific seat claim associated with this booking
      await supabaseAdmin
        .from("seat_claims")
        .delete()
        .eq("booking_id", booking.id);
    }
  }

  return NextResponse.json({ status: "ok" });
}