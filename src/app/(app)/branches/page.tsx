import { redirect } from "next/navigation";
import { format, parseISO } from "date-fns";
import { getCurrentCoach } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { BranchCoachCupsCompareRow, BranchDailySummaryRow } from "@/lib/types/database";
import { BranchesDateNav } from "./branches-date-nav";
import { BranchesList } from "./branches-list";

export default async function BranchesPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
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

  const { date: dateParam } = await searchParams;
  const date = dateParam ?? format(new Date(), "yyyy-MM-dd");
  const month = date.slice(0, 7);

  const supabase = await createClient();
  const [summaryRes, coachCupsRes] = await Promise.all([
    supabase.rpc("branches_daily_summary", { p_date: date }),
    supabase.rpc("branches_coach_cups_compare", { p_date: date }),
  ]);
  const branches = (summaryRes.data ?? []) as BranchDailySummaryRow[];
  const coachCups = (coachCupsRes.data ?? []) as BranchCoachCupsCompareRow[];

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Branches</h1>
        <BranchesDateNav date={date} hasExplicitDate={Boolean(dateParam)} />
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Your own club plus every nutrition club whose Owner named you as their sponsor. Numbers
        below are for {format(parseISO(date), "EEEE, d MMM yyyy")}, compared against each club&apos;s
        own previous operating day — each club&apos;s numbers stand on their own, never merged
        together.
      </p>

      <BranchesList
        branches={branches}
        coachCups={coachCups}
        ownClubId={coach.nc_club_id}
        date={date}
        month={month}
      />
    </div>
  );
}
