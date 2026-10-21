
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import LogoutButton from "./LogoutButton";

export const dynamic = "force-dynamic";

export default async function OrganizerDashboard() {
  const supabase = await createClient();

  // Verify the authenticated user on the server.
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    redirect("/organizer/login");
  }

  // Check permissions using the trusted server-side client.
  const { data: staff, error: staffError } = await supabaseAdmin
    .from("organizer_staff")
    .select("role, active")
    .eq("user_id", user.id)
    .maybeSingle();

  if (staffError) {
    console.error("Organizer permission lookup failed.");

    return (
      <main style={{ padding: 30 }}>
        <h1>Unable to verify access</h1>
        <p>Please try again later or contact the administrator.</p>
        <LogoutButton />
      </main>
    );
  }

  if (
    !staff ||
    staff.active !== true ||
    !["organizer", "entry_staff"].includes(staff.role)
  ) {
    return (
      <main
        style={{
          minHeight: "100vh",
          padding: 30,
          background: "#101010",
          color: "#f5f5f5",
        }}
      >
        <h1>Access denied</h1>
        <p>
          Your account is not authorised to access the
          THESPIAN TICKETS organiser dashboard.
        </p>
        <LogoutButton />
      </main>
    );
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        padding: 30,
        background: "#101010",
        color: "#f5f5f5",
      }}
    >
      <h1 style={{ color: "#d6b66b" }}>
        THESPIAN TICKETS
      </h1>

      <h2>Organiser Dashboard</h2>

      <p>Signed in as: {user.email}</p>
      <p>Role: {staff.role}</p>

      <section
        style={{
          marginTop: 25,
          padding: 20,
          border: "1px solid #b89b58",
          borderRadius: 10,
        }}
      >
        <h3>Ticket Verification</h3>
        <p>
          Your account is authorised. Barcode verification
          will be connected here in the next step.
        </p>
      </section>

      <div style={{ marginTop: 24 }}>
        <LogoutButton />
      </div>
    </main>
  );
}