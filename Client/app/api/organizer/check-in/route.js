
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const TICKET_CODE_RE = /^TKT-[A-Z0-9]+$/i;

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

    const rawToken =
      typeof body.token === "string" ? body.token.trim() : "";

    const rawTicketCode =
      typeof body.ticketCode === "string"
        ? body.ticketCode.trim().toUpperCase()
        : "";

    let token = UUID_RE.test(rawToken) ? rawToken : "";

    const ticketCode = TICKET_CODE_RE.test(rawTicketCode)
      ? rawTicketCode
      : !token && TICKET_CODE_RE.test(rawToken.toUpperCase())
        ? rawToken.toUpperCase()
        : "";


    const action = body.action;
    const showId = body.showId;

    if (!["show-1", "show-2"].includes(showId)) {
      return NextResponse.json(
        {
          success: false,
          error: "Select a valid show before scanning tickets.",
        },
        { status: 400 }
      );
    }

    if (!token && !ticketCode) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Invalid input. Enter a valid ticket code or scan a ticket QR code.",
        },
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
    // Find the ticket by its code or QR token, within the selected show.
    let matchingTicket;
    let ticketLookupError;

    if (ticketCode) {
      const lookup = await supabaseAdmin
        .from("tickets")
        .select("id, show_id, barcode_token")
        .eq("ticket_code", ticketCode)
        .eq("show_id", showId)
        .maybeSingle();

      matchingTicket = lookup.data;
      ticketLookupError = lookup.error;

      if (matchingTicket) {
        token =
          typeof matchingTicket.barcode_token === "string"
            ? matchingTicket.barcode_token.trim()
            : "";
      }
    } else {
      const lookup = await supabaseAdmin
        .from("tickets")
        .select("id, show_id")
        .eq("barcode_token", token)
        .eq("show_id", showId)
        .maybeSingle();

      matchingTicket = lookup.data;
      ticketLookupError = lookup.error;
    }

    if (ticketLookupError) {
      console.error("Ticket lookup failed:", ticketLookupError);

      return NextResponse.json(
        {
          success: false,
          error: "Could not verify the ticket for the selected show.",
        },
        { status: 500 }
      );
    }

    if (!matchingTicket) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Ticket not found for the selected show. Check the ticket code and selected show.",
        },
        { status: 404 }
      );
    }

    if (!token || !UUID_RE.test(token)) {
      return NextResponse.json(
        {
          success: false,
          error:
            "This ticket has no valid QR verification token. Please contact the organiser administrator.",
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
