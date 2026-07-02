"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ConsumptionType } from "@/lib/types/database";

export async function correctCheckinAction(
  checkinId: string,
  newCups: number,
  newConsumptionType: ConsumptionType,
  reason: string
) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("correct_checkin", {
    p_checkin_id: checkinId,
    p_new_cups: newCups,
    p_new_consumption_type: newConsumptionType,
    p_reason: reason,
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
