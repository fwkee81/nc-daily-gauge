import { redirect } from "next/navigation";
import { getCurrentCoach } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { CoachesClient } from "./coaches-client";

export default async function AdminCoachesPage() {
  const coach = await getCurrentCoach();
  if (!coach) redirect("/onboarding");
  if (!coach.is_admin) {
    return (
      <div className="rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
        Only the club Owner or Internship coach can manage coaches.
      </div>
    );
  }

  const supabase = await createClient();

  const [{ data: clubCoaches }, { data: allCoaches }] = await Promise.all([
    supabase
      .from("coaches")
      .select("id, name, contact, dob, sponsor_id, member_id, level, nc_position, nc_club_id, active")
      .eq("nc_club_id", coach.nc_club_id ?? "")
      .eq("active", true)
      .order("name"),
    supabase.from("coaches").select("id, name").eq("active", true).order("name"),
  ]);

  return (
    <CoachesClient
      currentCoachId={coach.id}
      coaches={clubCoaches ?? []}
      sponsorOptions={allCoaches ?? []}
    />
  );
}
