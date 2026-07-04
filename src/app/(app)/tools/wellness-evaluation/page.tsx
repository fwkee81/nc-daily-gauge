import { redirect } from "next/navigation";
import { getCurrentCoach } from "@/lib/auth";
import { WellnessEvaluationClient } from "./wellness-evaluation-client";

export default async function WellnessEvaluationPage() {
  const coach = await getCurrentCoach();
  if (!coach) redirect("/onboarding");

  return <WellnessEvaluationClient />;
}
