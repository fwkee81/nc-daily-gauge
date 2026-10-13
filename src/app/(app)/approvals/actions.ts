"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function approveCoach(coachId: string) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("approve_coach", { p_coach_id: coachId });

  if (error) return { error: error.message };
  revalidatePath("/approvals");
  revalidatePath("/dashboard");
  return { success: true };
}

export async function rejectCoach(coachId: string) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("reject_coach", { p_coach_id: coachId });

  if (error) return { error: error.message };
  revalidatePath("/approvals");
  revalidatePath("/dashboard");
  return { success: true };
}
