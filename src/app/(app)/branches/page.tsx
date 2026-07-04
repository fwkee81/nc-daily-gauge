import { redirect } from "next/navigation";
import { format } from "date-fns";
import { getCurrentCoach } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type {
  BranchCoachCupsCompareRow,
  BranchDailySummaryRow,
  BranchLeaderboardRow,
  BranchMonthlySummaryRow,
} from "@/lib/types/database";
import { BranchesTabs } from "./branches-tabs";

export default async function BranchesPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; date?: string; month?: string }>;
}) {
  const coach = await getCurrentCoach();
  if (!coach) redirect("/onboarding");
  if (!coach.is_admin) {
    return (
      <div className="rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
        Only the club Owner or Internship coach can view branch clubs.
      </div>
    );
  }

  const { tab: tabParam, date: dateParam, month: monthParam } = await searchParams;
  const tab = tabParam === "monthly" ? "monthly" : "daily";
  const date = dateParam ?? format(new Date(), "yyyy-MM-dd");
  const month = monthParam ?? format(new Date(), "yyyy-MM");

  const supabase = await createClient();
  const [summaryRes, coachCupsRes, monthlySummaryRes, leaderboardsRes] = await Promise.all([
    supabase.rpc("branches_daily_summary", { p_date: date }),
    supabase.rpc("branches_coach_cups_compare", { p_date: date }),
    supabase.rpc("branches_monthly_summary", { p_month: `${month}-01` }),
    supabase.rpc("branches_monthly_leaderboards", { p_month: `${month}-01` }),
  ]);
  const branches = (summaryRes.data ?? []) as BranchDailySummaryRow[];
  const coachCups = (coachCupsRes.data ?? []) as BranchCoachCupsCompareRow[];
  const monthlySummary = (monthlySummaryRes.data ?? []) as BranchMonthlySummaryRow[];
  const leaderboards = (leaderboardsRes.data ?? []) as BranchLeaderboardRow[];

  return (
    <div>
      <h1 className="text-2xl font-semibold">Branches</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Your own club plus every nutrition club whose Owner named you as their sponsor — each
        club&apos;s numbers stand on their own, never merged together.
      </p>

      <BranchesTabs
        tab={tab}
        date={date}
        hasExplicitDate={Boolean(dateParam)}
        month={month}
        hasExplicitMonth={Boolean(monthParam)}
        ownClubId={coach.nc_club_id}
        branches={branches}
        coachCups={coachCups}
        monthlySummary={monthlySummary}
        leaderboards={leaderboards}
      />
    </div>
  );
}
