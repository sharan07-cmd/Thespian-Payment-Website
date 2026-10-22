
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import LogoutButton from "./LogoutButton";
import OrganizerShowPanel from "./OrganizerShowPanel";

export const dynamic = "force-dynamic";

export default async function OrganizerDashboardPage() {
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
        <h1 className="text-2xl font-semibold">
          Unable to verify access
        </h1>
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

  return (
    <main className="min-h-screen bg-[#10100e] text-[#f5f1e7]">
      {/* Existing organiser header */}
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
        {/* Existing dashboard heading and staff details */}
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

        <OrganizerShowPanel />

        <footer className="border-t border-stone-800 pt-5 text-xs text-stone-500">
          THESPIAN TICKETS · Secure event entry management
        </footer>
      </div>
    </main>
  );
}
