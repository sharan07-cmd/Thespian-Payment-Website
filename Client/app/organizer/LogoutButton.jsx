
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";

export default function LogoutButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleLogout() {
    setLoading(true);
    setError("");

    const supabase = createClient();
    const { error: logoutError } = await supabase.auth.signOut();

    if (logoutError) {
      setError("Logout failed. Please try again.");
      setLoading(false);
      return;
    }

    router.replace("/organizer/login");
    router.refresh();
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleLogout}
        disabled={loading}
        style={{
          padding: "10px 18px",
          borderRadius: 7,
          border: "1px solid #d6b66b",
          background: "#181818",
          color: "#d6b66b",
          cursor: "pointer",
        }}
      >
        {loading ? "Signing out..." : "Logout"}
      </button>

      {error && <p role="alert">{error}</p>}
    </div>
  );
}