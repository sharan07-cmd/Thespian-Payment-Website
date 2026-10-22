
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

export async function POST(request) {
  try {
    // 1. Verify the logged-in organiser session.
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

    // 2. Verify active staff permissions.
    const { data: staff, error: staffError } =
      await supabaseAdmin
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
        { error: "You are not authorised to scan tickets." },
        { status: 403 }
      );
    }

    // 3. Validate the QR token and requested action.
    const body = await request.json();

    const token =
      typeof body.token === "string" ? body.token.trim() : "";

    const action = body.action;

    if (!["show-1", "show-2"].includes(showId)) {
      return NextResponse.json(
        {
          success: false,
          error: "Select a valid show before scanning tickets.",
        },
        { status: 400 }
      );
    }

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

    if (!["check-in", "check-out"].includes(action)) {
      return NextResponse.json(
        { error: "Choose check-in or check-out mode." },
        { status: 400 }
      );
    }

    // Verify that the ticket belongs to the selected show.
    const {
      data: matchingTicket,
      error: ticketLookupError,
    } = await supabaseAdmin
      .from("tickets")
      .select("id, show_id")
      .eq("barcode_token", token)
      .eq("show_id", showId)
      .maybeSingle();

    if (ticketLookupError) {
      console.error("Ticket show lookup failed:", ticketLookupError);

      return NextResponse.json(
        {
          success: false,
          error: "Could not verify which show this ticket belongs to.",
        },
        { status: 500 }
      );
    }

    if (!matchingTicket) {
      return NextResponse.json(
        {
          success: false,
          error: "This ticket does not belong to the selected show, or the ticket was not found.",
        },
        { status: 409 }
      );
    }

    // 4. Process the movement in one database transaction.
    // The PostgreSQL function validates the ticket, payment,
    // staff permissions, and current entry status.
    const { data, error: movementError } =
      await supabaseAdmin.rpc("process_ticket_movement", {
        p_token: token,
        p_staff_id: user.id,
        p_action: action,
        p_show_id: showId,
      });

    if (movementError) {
      console.error(
        "Ticket movement RPC failed:",
        movementError
      );

      return NextResponse.json(
        { error: "Could not process the ticket movement." },
        { status: 500 }
      );
    }

    // The function returns JSON containing success/error details.
    if (!data || data.success !== true) {
      const message = data?.error || "Ticket verification failed.";

      let status = 409;

      if (message === "Ticket not found.") {
        status = 404;
      } else if (
        message === "You are not authorised to scan tickets."
      ) {
        status = 403;
      }

      return NextResponse.json(
        {
          success: false,
          error: message,
          entryStatus: data?.entryStatus ?? null,
        },
        { status }
      );
    }

    // 5. Return the confirmed movement to the scanner.
    return NextResponse.json({
      success: true,
      action: data.action,
      message: data.message,
      entryStatus: data.entryStatus,
      ticket: data.ticket,
    });
  } catch (error) {
    console.error("Ticket movement API error:", error);

    return NextResponse.json(
      { error: "An unexpected error occurred." },
      { status: 500 }
    );
  }
}
