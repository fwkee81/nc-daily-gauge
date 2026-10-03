import { notFound, redirect } from "next/navigation";
import { canSeeFriendshipPass, getCurrentCoach, getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { FriendshipPassClient, type FriendshipPassRow } from "./friendship-pass-client";

export default async function FriendshipPassPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  // Soft launch — see canSeeFriendshipPass() in src/lib/auth.ts. A coach who
  // isn't on the beta list gets the same 404 as a route that doesn't exist,
  // so there's no hint this page is coming.
  if (!canSeeFriendshipPass(user.email)) notFound();

  const coach = await getCurrentCoach();
  if (!coach) redirect("/onboarding");
  if (!coach.is_admin || !coach.nc_club_id) notFound();

  const supabase = await createClient();

  const [{ data: passes }, { data: customers }] = await Promise.all([
    supabase
      .from("friendship_passes")
      .select(
        "*, customer:customers(name), issued_by_coach:coaches!friendship_passes_issued_by_fkey(name), voided_by_coach:coaches!friendship_passes_voided_by_fkey(name)"
      )
      .eq("nc_club_id", coach.nc_club_id)
      .order("expires_at"),
    supabase
      .from("customers")
      .select("id, name")
      .eq("nc_club_id", coach.nc_club_id)
      .eq("active", true)
      .order("name"),
  ]);

  return (
    <FriendshipPassClient
      passes={(passes ?? []) as unknown as FriendshipPassRow[]}
      customers={customers ?? []}
    />
  );
}
