import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import crypto from "crypto";

export async function POST(request) {
  try {
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
    const razorpayOrderId = event.payload.payment.entity.order_id;

    // 1. Handle Payment Failure (Your fast-release logic)
    if (event.event === "payment.failed") {
      const { data: booking, error: fetchError } = await supabaseAdmin
        .from("bookings")
        .select("id")
        .eq("razorpay_order_id", razorpayOrderId)
        .single();

      if (fetchError) throw fetchError;

      if (booking) {
        // Delete the specific seat claim associated with this booking
        const { error: deleteError } = await supabaseAdmin
          .from("seat_claims")
          .delete()
          .eq("booking_id", booking.id);
          
        if (deleteError) throw deleteError;

        // Optionally update the booking record itself to reflect the failure
        await supabaseAdmin
          .from("bookings")
          .update({ status: 'FAILED' })
          .eq("id", booking.id);
      }
    }

    // 2. Handle Payment Success
    if (event.event === "payment.captured" || event.event === "order.paid") {
      const paymentId = event.payload.payment.entity.id;
      
      const { error: updateError } = await supabaseAdmin
        .from('bookings')
        .update({ 
          razorpay_payment_id: paymentId,
          payment_status: "paid",
        })
        .eq('razorpay_order_id', razorpayOrderId);

      if (updateError) throw updateError;
      
      // If your architecture requires updating the seat_claims table upon success 
      // (e.g., changing a status from 'PENDING' to 'PAID'), do it here.
    }

    return NextResponse.json({ status: "ok" });
    
  } catch (error) {
    console.error("Webhook processing error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}