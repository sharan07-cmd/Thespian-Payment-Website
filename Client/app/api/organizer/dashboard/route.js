
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function errorResponse(message, status) {
  return NextResponse.json({ success: false, error: message }, { status });
}

export async function GET() {
  try {
    // 1. Verify the logged-in user.
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return errorResponse("Please log in to view the organiser dashboard.", 401);
    }

    // 2. Verify that the user is active authorised staff.
    const { data: staff, error: staffError } = await supabaseAdmin
      .from("organizer_staff")
      .select("user_id, role, active")
      .eq("user_id", user.id)
      .eq("active", true)
      .in("role", ["organizer", "entry_staff"])
      .maybeSingle();

    if (staffError) {
      console.error("Dashboard staff lookup failed:", staffError);
      return errorResponse("Could not verify organiser permissions.", 500);
    }

    if (!staff) {
      return errorResponse("You are not authorised to view this dashboard.", 403);
    }

    // Only tickets linked to fully paid bookings count as valid sold tickets.
    const paidTickets = () =>
      supabaseAdmin
        .from("tickets")
        .select("id, bookings!inner(status, payment_status)", {
          count: "exact",
          head: true,
        })
        .eq("bookings.status", "paid")
        .eq("bookings.payment_status", "paid");

    // 3. Get accurate counts directly from the database.
    const [totalResult, insideResult, movementCountResult] =
      await Promise.all([
        paidTickets(),

        paidTickets().eq("entry_status", "inside"),

        supabaseAdmin
          .from("ticket_movements")
          .select("id", { count: "exact", head: true }),
      ]);

    if (totalResult.error || insideResult.error || movementCountResult.error) {
      console.error("Dashboard count error:", {
        total: totalResult.error,
        inside: insideResult.error,
        movements: movementCountResult.error,
      });

      return errorResponse("Could not load attendance totals.", 500);
    }

    const totalTickets = totalResult.count ?? 0;
    const inside = insideResult.count ?? 0;
    const outside = Math.max(0, totalTickets - inside);

    // 4. Get the latest movement records.
    const { data: movements, error: movementsError } =
      await supabaseAdmin
        .from("ticket_movements")
        .select("id, ticket_id, action, staff_id, scanned_at")
        .order("scanned_at", { ascending: false })
        .limit(12);

    if (movementsError) {
      console.error("Dashboard activity error:", movementsError);
      return errorResponse("Could not load recent ticket activity.", 500);
    }

    // 5. Look up ticket details for those movements.
    const ticketIds = [
      ...new Set((movements ?? []).map((movement) => movement.ticket_id)),
    ];

    let ticketsById = {};

    if (ticketIds.length > 0) {
      const { data: tickets, error: ticketsError } = await supabaseAdmin
        .from("tickets")
        .select(
          "id, ticket_code, seat_id, bookings!inner(status, payment_status)"
        )
        .in("id", ticketIds)
        .eq("bookings.status", "paid")
        .eq("bookings.payment_status", "paid");

      if (ticketsError) {
        console.error("Dashboard ticket lookup error:", ticketsError);
        return errorResponse("Could not load ticket details.", 500);
      }

      ticketsById = Object.fromEntries(
        (tickets ?? []).map((ticket) => [ticket.id, ticket])
      );
    }

    // 6. Look up the staff roles without exposing private account data.
    const staffIds = [
      ...new Set((movements ?? []).map((movement) => movement.staff_id)),
    ];

    let rolesById = {};

    if (staffIds.length > 0) {
      const { data: staffMembers, error: rolesError } = await supabaseAdmin
        .from("organizer_staff")
        .select("user_id, role")
        .in("user_id", staffIds);

      if (rolesError) {
        console.error("Dashboard staff-role lookup error:", rolesError);
        return errorResponse("Could not load staff activity.", 500);
      }

      rolesById = Object.fromEntries(
        (staffMembers ?? []).map((member) => [member.user_id, member.role])
      );
    }

    // Ignore historical movements for tickets that are no longer paid.
    const recentActivity = (movements ?? [])
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
        stats: {
          ticketsSold: totalTickets,
          inside,
          outside,
          totalMovements: movementCountResult.count ?? 0,
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
    return errorResponse("An unexpected error occurred.", 500);
  }
}
