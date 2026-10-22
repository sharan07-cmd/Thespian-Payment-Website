
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import LogoutButton from "./LogoutButton";
import OrganizerCheckIn from "./OrganizerCheckIn";

export const dynamic = "force-dynamic";

function StatCard({ label, value, icon, description }) {
  return (
    <article className="rounded-2xl border border-[#443a27] bg-[#171612] p-5 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-stone-400">{label}</p>
          <p className="mt-3 text-3xl font-semibold tracking-tight text-white">
            {value}
          </p>
          <p className="mt-2 text-xs text-stone-500">{description}</p>
        </div>
        <div className="grid h-11 w-11 place-items-center rounded-xl bg-[#d6b66b]/10 text-xl text-[#d6b66b]">
          {icon}
        </div>
      </div>
    </article>
  );
}

export default async function OrganizerDashboard() {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    redirect("/organizer/login");
  }

  const { data: staff, error: staffError } = await supabaseAdmin
    .from("organizer_staff")
    .select("role, active")
    .eq("user_id", user.id)
    .maybeSingle();

  if (staffError) {
    console.error("Organizer permission lookup failed.");

    return (
      <main className="min-h-screen bg-[#10100e] p-8 text-white">
        <h1 className="text-2xl font-semibold">Unable to verify access</h1>
        <p className="mt-3 text-stone-400">
          Please try again later or contact the administrator.
        </p>
        <div className="mt-6">
          <LogoutButton />
        </div>
      </main>
    );
  }

  if (
    !staff ||
    staff.active !== true ||
    !["organizer", "entry_staff"].includes(staff.role)
  ) {
    return (
      <main className="min-h-screen bg-[#10100e] p-8 text-white">
        <h1 className="text-2xl font-semibold text-red-300">
          Access denied
        </h1>
        <p className="mt-3 text-stone-400">
          Your account is not authorised to access the THESPIAN TICKETS
          organiser dashboard.
        </p>
        <div className="mt-6">
          <LogoutButton />
        </div>
      </main>
    );
  }

  // All queries below run on the server, using the existing admin client.
  const [
    { count: totalTickets, error: totalError },
    { count: checkedInTickets, error: checkedInError },
    { data: recentCheckIns, error: recentError },
  ] = await Promise.all([
    supabaseAdmin
      .from("tickets")
      .select("id", { count: "exact", head: true }),

    supabaseAdmin
      .from("tickets")
      .select("id", { count: "exact", head: true })
      .not("checked_in_at", "is", null),

    supabaseAdmin
      .from("tickets")
      .select("ticket_code, seat_id, checked_in_at")
      .not("checked_in_at", "is", null)
      .order("checked_in_at", { ascending: false })
      .limit(8),
  ]);

  const statsAvailable = !totalError && !checkedInError;
  const total = totalTickets ?? 0;
  const checkedIn = checkedInTickets ?? 0;
  const remaining = Math.max(0, total - checkedIn);

  return (
    <main className="min-h-screen bg-[#10100e] text-[#f5f1e7]">
      <header className="border-b border-[#423723] bg-[#15140f]">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-5 py-5 sm:px-8">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-xl bg-[#d6b66b] text-xl text-[#17130a]">
              T
            </div>
            <div>
              <h1 className="font-bold tracking-[0.12em] text-[#e4c779]">
                THESPIAN TICKETS
              </h1>
              <p className="mt-1 text-[10px] tracking-[0.22em] text-stone-500">
                ORGANISER CONSOLE
              </p>
            </div>
          </div>
          <LogoutButton />
        </div>
      </header>

      <div className="mx-auto max-w-7xl space-y-8 px-5 py-8 sm:px-8 sm:py-10">
        <section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#d6b66b]">
              Event operations
            </p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
              Dashboard
            </h2>
            <p className="mt-3 text-sm text-stone-400">
              Monitor ticket entry and verify attendees securely.
            </p>
          </div>

          <div className="rounded-xl border border-[#443a27] bg-[#171612] px-4 py-3">
            <p className="text-xs text-stone-500">Signed in as</p>
            <p className="mt-1 break-all text-sm text-white">
              {user.email || "Organiser"}
            </p>
            <p className="mt-1 text-xs capitalize text-[#d6b66b]">
              {staff.role.replaceAll("_", " ")}
            </p>
          </div>
        </section>

        <section>
          <div className="mb-4">
            <h3 className="text-lg font-semibold">Ticket overview</h3>
            <p className="mt-1 text-sm text-stone-500">
              Counts from your tickets database.
            </p>
          </div>

          {!statsAvailable && (
            <p
              role="status"
              className="mb-4 rounded-lg border border-amber-800 bg-amber-950/30 p-3 text-sm text-amber-200"
            >
              Ticket statistics are temporarily unavailable. Check your
              server logs and database permissions.
            </p>
          )}

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <StatCard
              label="Tickets recorded"
              value={statsAvailable ? total.toLocaleString() : "—"}
              icon="▤"
              description="All records in the tickets table"
            />
            <StatCard
              label="Successful check-ins"
              value={statsAvailable ? checkedIn.toLocaleString() : "—"}
              icon="✓"
              description="Tickets with a check-in timestamp"
            />
            <StatCard
              label="Not yet checked in"
              value={statsAvailable ? remaining.toLocaleString() : "—"}
              icon="◷"
              description="Recorded tickets without a check-in timestamp"
            />
          </div>

          <p className="mt-3 text-xs leading-5 text-stone-500">
            These counts include every record in the tickets table. They are
            not necessarily counts of paid tickets. Check booking payment
            status before treating a ticket as valid for entry.
          </p>
        </section>

        <section className="grid items-start gap-6 xl:grid-cols-[1.15fr_0.85fr]">
          <OrganizerCheckIn />

          <aside className="rounded-2xl border border-[#443a27] bg-[#171612] p-5 sm:p-7">
            <div className="mb-5">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#d6b66b]">
                Activity
              </p>
              <h3 className="mt-2 text-xl font-semibold">
                Recent check-ins
              </h3>
              <p className="mt-1 text-sm text-stone-400">
                Latest recorded entries
              </p>
            </div>

            {recentError ? (
              <p className="text-sm text-amber-200">
                Unable to load recent check-ins.
              </p>
            ) : !recentCheckIns?.length ? (
              <p className="rounded-xl border border-dashed border-stone-700 p-5 text-sm text-stone-400">
                No tickets have been checked in yet.
              </p>
            ) : (
              <div className="divide-y divide-stone-800">
                {recentCheckIns.map((ticket, index) => (
                  <div
                    key={`${ticket.ticket_code}-${ticket.checked_in_at}-${index}`}
                    className="flex items-start justify-between gap-3 py-4 first:pt-0 last:pb-0"
                  >
                    <div className="min-w-0">
                      <p className="break-all text-sm font-semibold text-white">
                        {ticket.ticket_code || "Ticket"}
                      </p>
                      <p className="mt-1 text-xs text-stone-400">
                        Seat: {ticket.seat_id || "N/A"}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <span className="inline-flex rounded-full bg-emerald-950 px-2 py-1 text-[10px] font-bold text-emerald-300">
                        CHECKED IN
                      </span>
                      <p className="mt-2 text-xs text-stone-500">
                        {ticket.checked_in_at
                          ? new Date(ticket.checked_in_at).toLocaleString(
                              "en-IN",
                              {
                                dateStyle: "medium",
                                timeStyle: "short",
                                timeZone: "Asia/Kolkata",
                              }
                            )
                          : ""}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <p className="mt-5 border-t border-stone-800 pt-4 text-xs text-stone-500">
              Refresh the page to load the latest activity.
            </p>
          </aside>
        </section>

        <footer className="border-t border-stone-800 pt-5 text-xs text-stone-500">
          THESPIAN TICKETS · Secure event entry management
        </footer>
      </div>
    </main>
  );
}
