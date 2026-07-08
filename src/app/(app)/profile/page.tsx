import { redirect } from "next/navigation";
import { getCurrentCoach } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ProfileForm } from "./profile-form";

export default async function ProfilePage() {
  const coach = await getCurrentCoach();
  if (!coach) redirect("/onboarding");

  const supabase = await createClient();

  let clubName: string | null = null;
  if (coach.nc_club_id) {
    const { data } = await supabase
      .from("nc_clubs")
      .select("name")
      .eq("id", coach.nc_club_id)
      .maybeSingle();
    clubName = data?.name ?? null;
  }

  let sponsorName: string | null = null;
  if (coach.sponsor_id) {
    const { data } = await supabase
      .from("coaches")
      .select("name")
      .eq("id", coach.sponsor_id)
      .maybeSingle();
    sponsorName = data?.name ?? null;
  }

  return (
    <div className="max-w-xl">
      <h1 className="text-2xl font-semibold">My Profile</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Update your personal details below.
      </p>
      <ProfileForm
        coach={coach}
        clubName={clubName}
        sponsorName={sponsorName}
      />
    </div>
  );
}
