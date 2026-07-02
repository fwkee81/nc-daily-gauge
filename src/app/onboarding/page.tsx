import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentCoach } from "@/lib/auth";
import { OnboardingForm } from "./onboarding-form";

export default async function OnboardingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const existingCoach = await getCurrentCoach();
  if (existingCoach) {
    redirect("/dashboard");
  }

  const [{ data: coaches }, { data: clubs }] = await Promise.all([
    supabase.from("coaches").select("id, name, nc_position").eq("active", true).order("name"),
    supabase.from("nc_clubs").select("id, name").order("name"),
  ]);

  return (
    <div className="mx-auto w-full max-w-xl px-4 py-10">
      <h1 className="text-2xl font-semibold">Complete your coach profile</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        This is a one-time setup so we can attach your check-ins, customers, and reports to the
        right nutrition club.
      </p>
      <OnboardingForm
        coaches={coaches ?? []}
        clubs={clubs ?? []}
        isFirstCoach={(coaches ?? []).length === 0}
      />
    </div>
  );
}
