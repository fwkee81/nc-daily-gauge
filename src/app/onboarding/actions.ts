"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { CoachLevel, NcPosition } from "@/lib/types/database";

// Step 1 of onboarding — looks up the sponsor's own Herbalife Member ID
// before anything else is filled in. Anyone can read coaches (RLS is
// `using (true)`), so this works even before the caller has a coaches row
// of their own. Must be an active, already-approved coach — a pending
// registration can't sponsor another one.
//
// Excludes a paired "secondary" coach (primary_coach_id is set) — a couple
// sharing one real Herbalife member ID would otherwise match TWO rows here
// and .maybeSingle() throws on that. Only the primary (or a solo,
// unpaired coach) is ever matchable as a sponsor; see effective_coach_id()
// in supabase/schema.sql for how a secondary's own actions still count
// toward their primary everywhere else.
export async function verifySponsor(sponsorMemberId: string) {
  const trimmed = sponsorMemberId.trim();
  if (!trimmed) {
    return { error: "Enter your sponsor's Herbalife Member ID." };
  }

  const supabase = await createClient();
  const { data: sponsor } = await supabase
    .from("coaches")
    .select("id, name")
    .eq("member_id", trimmed)
    .eq("active", true)
    .eq("approved", true)
    .is("primary_coach_id", null)
    .maybeSingle();

  if (!sponsor) {
    return { error: "No coach found with that Herbalife Member ID. Please check with your sponsor." };
  }

  return { data: sponsor as { id: string; name: string } };
}

export interface CompleteOnboardingInput {
  name: string;
  contact: string;
  dob: string;
  sponsorId: string;
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

  if (!input.sponsorId) {
    return { error: "Sponsor verification is required." };
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

  // Always starts unapproved — RLS (coaches_insert_self) rejects this insert
  // outright if approved isn't explicitly false, so this isn't just a
  // default, it's enforced. An admin in the sponsor's upline chain (or the
  // super admin) has to call approve_coach() before this account can do
  // anything — see (app)/layout.tsx and /pending-approval.
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
    approved: false,
  });

  if (error) {
    return { error: error.message };
  }

  redirect("/pending-approval");
}
