"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { CoachLevel, NcPosition } from "@/lib/types/database";

export async function updateProfile(input: { name: string; contact: string; dob: string }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Not signed in." };
  }

  const { error } = await supabase
    .from("coaches")
    .update({ name: input.name, contact: input.contact, dob: input.dob })
    .eq("auth_user_id", user.id);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/profile");
  return { success: true };
}

export interface CoachingDetailsInput {
  sponsorId: string | null;
  memberId: string;
  level: CoachLevel;
  ncPosition: NcPosition;
  ncClubId: string;
  active: boolean;
}

export async function updateCoachingDetails(input: CoachingDetailsInput) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Not signed in." };
  }

  const { error } = await supabase
    .from("coaches")
    .update({
      sponsor_id: input.sponsorId,
      member_id: input.memberId,
      level: input.level,
      nc_position: input.ncPosition,
      nc_club_id: input.ncClubId,
      active: input.active,
    })
    .eq("auth_user_id", user.id);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/profile");
  return { success: true };
}
