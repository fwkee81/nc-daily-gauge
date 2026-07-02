import { redirect } from "next/navigation";
import { getCurrentCoach, getCurrentUser } from "@/lib/auth";

export default async function Home() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const coach = await getCurrentCoach();
  redirect(coach ? "/dashboard" : "/onboarding");
}
