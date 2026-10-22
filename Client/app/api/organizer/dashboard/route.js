
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function errorResponse(message, status) {
  return NextResponse.json(
    { success: false, error: message },
    { status }
  );
}

export async function GET(request) {
  try {
    // 1. Verify the logged-in user.
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return errorResponse(
        "Please log in to view the organiser dashboard.",
        401
      );
    }

    // 2. Verify authorised staff.
    const { data: staff, error: staffError } = await supabaseAdmin
      .from("organizer_staff")
      .select("user_id, role, active")
      .eq("user_id", user.id)
      .eq("active", true)
      .in("role", ["organizer", "entry_staff"])
      .maybeSingle();

    if (staffError) {
      console.error("Dashboard staff lookup failed:", staffError);
      return errorResponse(
        "Could not verify organiser permissions.",
        500
      );
    }

    if (!staff) {
      return errorResponse(
        "You are not authorised to view this dashboard.",
        403
      );
    }

    // 3. Require a valid show ID.
    const { searchParams } = new URL(request.url);
    const showId = searchParams.get("showId");

    if (!["show-1", "show-2"].includes(showId)) {
      return errorResponse(
        "Select a valid show to view attendance.",
        400
      );
    }

    // 4. Load paid tickets for this show only.
    const { data: tickets, error: ticketsError } =
      await supabaseAdmin
        .from("tickets")
        .select(
          "id, ticket_code, seat_id, entry_status, bookings!inner(status, payment_status)"
        )
        .eq("show_id", showId)
        .eq("bookings.status", "paid")
        .eq("bookings.payment_status", "paid");

    if (ticketsError) {
      console.error("Dashboard ticket query failed:", ticketsError);
      return errorResponse(
        "Could not load attendance totals.",
        500
      );
    }

    const paidTickets = tickets ?? [];
    const ticketIds = paidTickets.map((ticket) => ticket.id);
    const ticketsSold = paidTickets.length;
    const inside = paidTickets.filter(
      (ticket) => ticket.entry_status === "inside"
    ).length;
    const outside = Math.max(0, ticketsSold - inside);

    // 5. Count movements only for this show's tickets.
    let totalMovements = 0;
    let movements = [];

    if (ticketIds.length > 0) {
      const { count, error: movementCountError } =
        await supabaseAdmin
          .from("ticket_movements")
          .select("id", { count: "exact", head: true })
          .in("ticket_id", ticketIds);

      if (movementCountError) {
        console.error(
          "Dashboard movement count failed:",
          movementCountError
        );
        return errorResponse(
          "Could not load attendance totals.",
          500
        );
      }

      totalMovements = count ?? 0;

      // 6. Fetch recent movements for these tickets only.
      const { data, error: movementsError } =
        await supabaseAdmin
          .from("ticket_movements")
          .select("id, ticket_id, action, staff_id, scanned_at")
          .in("ticket_id", ticketIds)
          .order("scanned_at", { ascending: false })
          .limit(12);

      if (movementsError) {
        console.error(
          "Dashboard activity query failed:",
          movementsError
        );
        return errorResponse(
          "Could not load recent ticket activity.",
          500
        );
      }

      movements = data ?? [];
    }

    // 7. Prepare ticket details.
    const ticketsById = Object.fromEntries(
      paidTickets.map((ticket) => [ticket.id, ticket])
    );

    // 8. Look up staff roles for recent movements.
    const staffIds = [
      ...new Set(
        movements
          .map((movement) => movement.staff_id)
          .filter(Boolean)
      ),
    ];

    let rolesById = {};

    if (staffIds.length > 0) {
      const { data: staffMembers, error: rolesError } =
        await supabaseAdmin
          .from("organizer_staff")
          .select("user_id, role")
          .in("user_id", staffIds);

      if (rolesError) {
        console.error("Dashboard staff-role lookup failed:", rolesError);
        return errorResponse(
          "Could not load staff activity.",
          500
        );
      }

      rolesById = Object.fromEntries(
        (staffMembers ?? []).map((member) => [
          member.user_id,
          member.role,
        ])
      );
    }

    const recentActivity = movements
      .filter((movement) => ticketsById[movement.ticket_id])
      .map((movement) => {
        const ticket = ticketsById[movement.ticket_id];

        return {
          id: movement.id,
          action: movement.action,
          scannedAt: movement.scanned_at,
          ticketCode: ticket.ticket_code,
          seatId: ticket.seat_id,
          staffRole: rolesById[movement.staff_id] ?? "staff",
        };
      });

    return NextResponse.json(
      {
        success: true,
        showId,
        stats: {
          ticketsSold,
          inside,
          outside,
          totalMovements,
        },
        recentActivity,
        updatedAt: new Date().toISOString(),
      },
      {
        headers: {
          "Cache-Control": "no-store, max-age=0",
        },
      }
    );
  } catch (error) {
    console.error("Unexpected organiser dashboard error:", error);
    return errorResponse(
      "An unexpected error occurred.",
      500
    );
  }
}
