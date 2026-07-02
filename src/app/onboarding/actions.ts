"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { CoachLevel, NcPosition } from "@/lib/types/database";

export interface CompleteOnboardingInput {
  name: string;
  contact: string;
  dob: string;
  sponsorId: string | null;
  memberId: string;
  level: CoachLevel;
  clubName: string;
  ncPosition: NcPosition;
}

export async function completeOnboarding(input: CompleteOnboardingInput) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const trimmedClubName = input.clubName.trim();
  if (!trimmedClubName) {
    return { error: "Nutrition club name is required." };
  }

  const { data: existingClub } = await supabase
    .from("nc_clubs")
    .select("id")
    .ilike("name", trimmedClubName)
    .maybeSingle();

  let clubId = existingClub?.id as string | undefined;

  if (!clubId) {
    const { data: newClub, error: clubError } = await supabase
      .from("nc_clubs")
      .insert({ name: trimmedClubName })
      .select("id")
      .single();

    if (clubError || !newClub) {
      return { error: clubError?.message ?? "Could not create the nutrition club." };
    }
    clubId = newClub.id as string;
  }

  const { error } = await supabase.from("coaches").insert({
    auth_user_id: user.id,
    name: input.name,
    contact: input.contact,
    dob: input.dob,
    sponsor_id: input.sponsorId,
    member_id: input.memberId,
    level: input.level,
    nc_club_id: clubId,
    nc_position: input.ncPosition,
  });

  if (error) {
    return { error: error.message };
  }

  redirect("/dashboard");
}
