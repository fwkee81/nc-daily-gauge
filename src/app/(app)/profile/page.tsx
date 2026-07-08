import { redirect } from "next/navigation";
import { getCurrentCoach } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ProfileForm } from "./profile-form";

export default async function ProfilePage() {
  const coach = await getCurrentCoach();
  if (!coach) redirect("/onboarding");

  const supabase = await createClient();

  const [{ data: sponsorOptions }, { data: clubOptions }] = await Promise.all([
    supabase.from("coaches").select("id, name").eq("active", true).order("name"),
    supabase.from("nc_clubs").select("id, name").order("name"),
  ]);

  return (
    <div className="max-w-xl">
      <h1 className="text-2xl font-semibold">My Profile</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Update your personal details below.
      </p>
      <ProfileForm
        coach={coach}
        sponsorOptions={sponsorOptions ?? []}
        clubOptions={clubOptions ?? []}
      />
    </div>
  );
}
