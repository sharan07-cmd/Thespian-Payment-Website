import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin"; 

export async function GET(request) {
  // Get the current time in ISO format
  const now = new Date().toISOString();

  // Delete claims where the current time has passed the expires_at time
  const { data, error } = await supabaseAdmin
    .from("seat_claims")
    .delete()
    .lt('expires_at', now) 
    .select();

  if (error) {
    console.error("Cron Error releasing seats:", error.message);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ 
    success: true, 
    message: `Released ${data?.length || 0} expired seat claims.` 
  });
}