import { redirect } from "next/navigation";
import { getCurrentCoach, getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { SUPER_ADMIN_EMAIL } from "@/lib/constants";
import { CoachesClient, type CoachRow } from "./coaches-client";

export default async function AdminCoachesPage() {
  const coach = await getCurrentCoach();
  if (!coach) redirect("/onboarding");
  if (!coach.is_admin) {
    return (
      <div className="rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
        Only the club Owner or Internship coach can view coaches.
      </div>
    );
  }

  const user = await getCurrentUser();
  const isSuperAdmin = user?.email === SUPER_ADMIN_EMAIL;

  const supabase = await createClient();

  const { data: visibleClubRows } = await supabase.rpc("list_visible_club_ids", {
    p_coach_id: coach.id,
  });
  const clubIds = (visibleClubRows ?? []).map((row) => row.club_id);

  const [{ data: networkCoaches }, { data: allCoaches }] = await Promise.all([
    supabase
      .from("coaches")
      .select(
        "id, name, contact, dob, sponsor_id, member_id, level, nc_position, nc_club_id, active, nc_club:nc_clubs(name)"
      )
      .in("nc_club_id", clubIds.length > 0 ? clubIds : [""])
      .eq("active", true)
      .order("name"),
    supabase.from("coaches").select("id, name").eq("active", true).order("name"),
  ]);

  return (
    <CoachesClient
      currentCoachId={coach.id}
      isSuperAdmin={isSuperAdmin}
      coaches={(networkCoaches ?? []) as unknown as CoachRow[]}
      sponsorOptions={allCoaches ?? []}
    />
  );
}
