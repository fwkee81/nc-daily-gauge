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

  const [{ data: networkCoaches }, { data: allCoaches }, { data: clubs }, { data: emails }] =
    await Promise.all([
      supabase
        .from("coaches")
        .select(
          "id, name, contact, dob, sponsor_id, member_id, level, nc_position, nc_club_id, active, nc_club:nc_clubs(name)"
        )
        .in("nc_club_id", clubIds.length > 0 ? clubIds : [""])
        .eq("active", true)
        .order("name"),
      supabase.from("coaches").select("id, name").eq("active", true).order("name"),
      supabase.from("nc_clubs").select("id, name").order("name"),
      // auth.users isn't exposed to PostgREST — this RPC is the only way to
      // get each coach's login email, useful for telling apart two accounts
      // that registered with near-identical names.
      supabase.rpc("network_coach_emails"),
    ]);

  const emailByCoachId = new Map((emails ?? []).map((e) => [e.coach_id, e.email]));
  const coachesWithEmail = (networkCoaches ?? []).map((c) => ({
    ...c,
    email: emailByCoachId.get(c.id) ?? null,
  }));

  return (
    <CoachesClient
      currentCoachId={coach.id}
      isSuperAdmin={isSuperAdmin}
      coaches={coachesWithEmail as unknown as CoachRow[]}
      sponsorOptions={allCoaches ?? []}
      clubOptions={clubs ?? []}
    />
  );
}
