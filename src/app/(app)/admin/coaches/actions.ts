"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentCoach } from "@/lib/auth";
import type { CoachLevel, NcPosition } from "@/lib/types/database";

export interface CoachFormInput {
  name: string;
  contact: string;
  dob: string;
  sponsorId: string | null;
  memberId: string;
  level: CoachLevel;
  ncPosition: NcPosition;
}

export async function updateCoach(id: string, input: CoachFormInput) {
  const coach = await getCurrentCoach();
  if (!coach || !coach.is_admin) {
    return { error: "Not authorized." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("coaches")
    .update({
      name: input.name,
      contact: input.contact,
      dob: input.dob,
      sponsor_id: input.sponsorId,
      member_id: input.memberId,
      level: input.level,
      nc_position: input.ncPosition,
    })
    .eq("id", id);

  if (error) return { error: error.message };

  revalidatePath("/admin/coaches");
  return { success: true };
}

// Soft delete, same reasoning as customers: checkins/customers reference
// coaches, so "removing" a coach sets active = false instead of deleting.
export async function deactivateCoach(id: string) {
  const coach = await getCurrentCoach();
  if (!coach || !coach.is_admin) {
    return { error: "Not authorized." };
  }
  if (coach.id === id) {
    return { error: "You can't deactivate your own coach account." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("coaches").update({ active: false }).eq("id", id);

  if (error) return { error: error.message };

  revalidatePath("/admin/coaches");
  return { success: true };
}
