import { redirect } from "next/navigation";
import { getCurrentCoach, getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { SUPER_ADMIN_EMAIL } from "@/lib/constants";
import { RecipesClient } from "./recipes-client";

export default async function RecipesPage() {
  const coach = await getCurrentCoach();
  if (!coach) redirect("/onboarding");

  const user = await getCurrentUser();
  if (user?.email !== SUPER_ADMIN_EMAIL) {
    return (
      <div className="rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
        This page isn&apos;t available yet.
      </div>
    );
  }

  const supabase = await createClient();
  const { data: recipes } = await supabase.from("shake_recipes").select("*").order("code");

  return <RecipesClient recipes={recipes ?? []} />;
}
