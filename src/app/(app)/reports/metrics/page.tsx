import { redirect } from "next/navigation";
import { format } from "date-fns";
import { getCurrentCoach } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { MetricsClient } from "./metrics-client";

export default async function MetricsPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const coach = await getCurrentCoach();
  if (!coach) redirect("/onboarding");

  const { month: monthParam } = await searchParams;
  const month = monthParam ?? format(new Date(), "yyyy-MM");

  const supabase = await createClient();

  const [totalsRes, coachCupsRes] = await Promise.all([
    supabase.rpc("monthly_totals", { p_month: `${month}-01` }),
    supabase.rpc("monthly_coach_cups", { p_month: `${month}-01` }),
  ]);

  return (
    <MetricsClient
      month={month}
      totals={totalsRes.data?.[0] ?? { total_cups: 0, days_in_period: 0, avg_daily_cups: 0 }}
      coachCups={coachCupsRes.data ?? []}
    />
  );
}
