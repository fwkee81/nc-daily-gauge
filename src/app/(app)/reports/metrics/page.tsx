import { redirect } from "next/navigation";
import { format } from "date-fns";
import { getCurrentCoach } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { MetricsClient } from "./metrics-client";

export default async function MetricsPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; club?: string; tab?: string }>;
}) {
  const coach = await getCurrentCoach();
  if (!coach) redirect("/onboarding");

  const { month: monthParam, club: clubParam, tab } = await searchParams;
  const month = monthParam ?? format(new Date(), "yyyy-MM");
  const clubId = clubParam || coach.nc_club_id || "";
  const viewingBranch = Boolean(clubParam && clubParam !== coach.nc_club_id);

  const supabase = await createClient();

  const [totalsRes, coachCupsRes, packageSalesRes, clubRes, customersRes] = await Promise.all([
    supabase.rpc("monthly_totals", { p_month: `${month}-01`, p_club_id: clubId }),
    supabase.rpc("monthly_coach_cups", { p_month: `${month}-01`, p_club_id: clubId }),
    supabase.rpc("monthly_package_sales", { p_month: `${month}-01`, p_club_id: clubId }),
    supabase.from("nc_clubs").select("name").eq("id", clubId).maybeSingle(),
    // Snapshot of the current customer base for the Demographics tab (gender,
    // age, birthdays, Health Ambassadors) — not month-scoped like the rest of
    // this page, since it reflects who's in the club right now.
    supabase
      .from("customers")
      .select(
        "id, name, gender, dob, age_override, nc_level, member_id, invited_by_type, invited_by_customer_id"
      )
      .eq("nc_club_id", clubId)
      .eq("active", true),
  ]);

  return (
    <MetricsClient
      month={month}
      hasExplicitMonth={Boolean(monthParam)}
      clubId={clubId}
      clubName={clubRes.data?.name ?? null}
      viewingBranch={viewingBranch}
      tab={tab === "demographics" ? "demographics" : "activity"}
      totals={totalsRes.data?.[0] ?? { total_cups: 0, days_in_period: 0, avg_daily_cups: 0 }}
      coachCups={coachCupsRes.data ?? []}
      packageSales={packageSalesRes.data ?? []}
      customers={customersRes.data ?? []}
    />
  );
}
