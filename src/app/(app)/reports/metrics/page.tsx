import { redirect } from "next/navigation";
import { format } from "date-fns";
import { getCurrentCoach } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { MetricsClient } from "./metrics-client";

export default async function MetricsPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; club?: string }>;
}) {
  const coach = await getCurrentCoach();
  if (!coach) redirect("/onboarding");

  const { month: monthParam, club: clubParam } = await searchParams;
  const month = monthParam ?? format(new Date(), "yyyy-MM");
  const clubId = clubParam || coach.nc_club_id || "";
  const viewingBranch = Boolean(clubParam && clubParam !== coach.nc_club_id);

  const supabase = await createClient();

  const [totalsRes, coachCupsRes, packageSalesRes, clubRes] = await Promise.all([
    supabase.rpc("monthly_totals", { p_month: `${month}-01`, p_club_id: clubId }),
    supabase.rpc("monthly_coach_cups", { p_month: `${month}-01`, p_club_id: clubId }),
    supabase.rpc("monthly_package_sales", { p_month: `${month}-01`, p_club_id: clubId }),
    supabase.from("nc_clubs").select("name").eq("id", clubId).maybeSingle(),
  ]);

  return (
    <MetricsClient
      month={month}
      hasExplicitMonth={Boolean(monthParam)}
      clubId={clubId}
      clubName={clubRes.data?.name ?? null}
      viewingBranch={viewingBranch}
      totals={totalsRes.data?.[0] ?? { total_cups: 0, days_in_period: 0, avg_daily_cups: 0 }}
      coachCups={coachCupsRes.data ?? []}
      packageSales={packageSalesRes.data ?? []}
    />
  );
}
