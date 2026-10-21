
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

export async function POST(request) {
  try {
    // 1. Verify the organiser's logged-in session.
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "Please log in to the organiser account." },
        { status: 401 }
      );
    }

    // 2. Verify the staff member is active and authorised.
    const { data: staff, error: staffError } = await supabaseAdmin
      .from("organizer_staff")
      .select("role, active")
      .eq("user_id", user.id)
      .maybeSingle();

    if (
      staffError ||
      !staff ||
      !staff.active ||
      !["organizer", "entry_staff"].includes(staff.role)
    ) {
      return NextResponse.json(
        { error: "You are not authorised to check in tickets." },
        { status: 403 }
      );
    }

    // 3. Read the scanned ticket token.
    const body = await request.json();
    const token =
      typeof body.token === "string" ? body.token.trim() : "";

    if (
      !token ||
      token.length > 100 ||
      !/^[0-9a-f-]{36}$/i.test(token)
    ) {
      return NextResponse.json(
        { error: "Invalid ticket QR code." },
        { status: 400 }
      );
    }

    // 4. Find the ticket.
    const { data: ticket, error: ticketError } = await supabaseAdmin
      .from("tickets")
      .select("id, ticket_code, seat_id, booking_id, checked_in_at")
      .eq("barcode_token", token)
      .maybeSingle();

    if (ticketError) {
      console.error("Ticket lookup failed:", ticketError);
      return NextResponse.json(
        { error: "Could not verify the ticket." },
        { status: 500 }
      );
    }

    if (!ticket) {
      return NextResponse.json(
        { error: "Ticket not found. Please check the QR code." },
        { status: 404 }
      );
    }

    // 5. Confirm that the booking is paid.
    const { data: booking, error: bookingError } = await supabaseAdmin
      .from("bookings")
      .select("status, payment_status")
      .eq("id", ticket.booking_id)
      .maybeSingle();

    if (bookingError) {
      console.error("Booking lookup failed:", bookingError);
      return NextResponse.json(
        { error: "Could not verify the booking." },
        { status: 500 }
      );
    }

    if (
      !booking ||
      booking.status !== "paid" ||
      booking.payment_status !== "paid"
    ) {
      return NextResponse.json(
        { error: "This ticket does not belong to a confirmed paid booking." },
        { status: 409 }
      );
    }

    // 6. Atomically check in the ticket only if it has not been used.
    // Concurrent scans cannot both successfully update the same ticket.
    const { data: checkedInTicket, error: checkInError } =
      await supabaseAdmin
        .from("tickets")
        .update({
          checked_in_at: new Date().toISOString(),
          checked_in_by: user.id,
        })
        .eq("id", ticket.id)
        .is("checked_in_at", null)
        .select("ticket_code, seat_id, checked_in_at")
        .maybeSingle();

    if (checkInError) {
      console.error("Ticket check-in failed:", checkInError);
      return NextResponse.json(
        { error: "Could not complete check-in." },
        { status: 500 }
      );
    }

    if (!checkedInTicket) {
      return NextResponse.json(
        { error: "This ticket has already been checked in." },
        { status: 409 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Ticket verified. Check-in successful!",
      ticket: {
        ticketCode: checkedInTicket.ticket_code,
        seatId: checkedInTicket.seat_id,
        checkedInAt: checkedInTicket.checked_in_at,
      },
    });
  } catch (error) {
    console.error("Check-in API error:", error);
    return NextResponse.json(
      { error: "An unexpected error occurred." },
      { status: 500 }
    );
  }
}