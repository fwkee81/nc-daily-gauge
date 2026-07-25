"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentCoach } from "@/lib/auth";
import type { ConsumptionType } from "@/lib/types/database";

export async function correctCheckinAction(
  checkinId: string,
  newCups: number,
  newConsumptionType: ConsumptionType,
  reason: string,
  newIsBirthdayShake: boolean = false
) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("correct_checkin", {
    p_checkin_id: checkinId,
    p_new_cups: newCups,
    p_new_consumption_type: newConsumptionType,
    p_reason: reason,
    p_new_is_birthday_shake: newIsBirthdayShake,
  });

  if (error) return { error: error.message };
  revalidatePath("/reports/daily");
  return { success: true };
}

export async function voidCheckinAction(checkinId: string, reason: string) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("void_checkin", {
    p_checkin_id: checkinId,
    p_reason: reason,
  });

  if (error) return { error: error.message };
  revalidatePath("/reports/daily");
  return { success: true };
}

export async function getCheckinHistory(checkinId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("checkin_edits")
    .select("id, field_changed, old_value, new_value, reason, created_at, editor:coaches(name)")
    .eq("checkin_id", checkinId)
    .order("created_at", { ascending: false });

  if (error) return { error: error.message };
  return { data: data ?? [] };
}

// Appends one entry to the day's "what happened today" log for a club — not
// tied to any customer or ledger row. nc_club_id comes from the caller (the
// club the Daily Report page is currently showing), but created_by_coach_id
// is always derived server-side — never trust the client for that, since
// RLS on daily_report_logs checks it.
export async function addDailyReportLogAction(clubId: string, date: string, note: string) {
  const coach = await getCurrentCoach();
  if (!coach) return { error: "Not authorized." };

  const trimmed = note.trim();
  if (!trimmed) return { error: "Please enter a note." };

  const supabase = await createClient();
  const { error } = await supabase.from("daily_report_logs").insert({
    nc_club_id: clubId,
    log_date: date,
    note: trimmed,
    created_by_coach_id: coach.id,
  });

  if (error) return { error: error.message };
  revalidatePath("/reports/daily");
  return { success: true };
}

// Fixes a typo/mistake on an existing log entry in place, instead of adding
// a new one. RLS on daily_report_logs restricts this to whoever wrote the
// entry, or an admin — enforced server-side, not just hidden in the UI.
export async function updateDailyReportLogAction(id: string, note: string) {
  const trimmed = note.trim();
  if (!trimmed) return { error: "Please enter a note." };

  const supabase = await createClient();
  const { error } = await supabase.from("daily_report_logs").update({ note: trimmed }).eq("id", id);

  if (error) return { error: error.message };
  revalidatePath("/reports/daily");
  return { success: true };
}
