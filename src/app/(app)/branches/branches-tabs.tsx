"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { format, parseISO } from "date-fns";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import type {
  BranchCoachCupsCompareRow,
  BranchDailySummaryRow,
  BranchLeaderboardRow,
  BranchMonthlySummaryRow,
  BranchWeeklySummaryRow,
} from "@/lib/types/database";
import { BranchesDateNav } from "./branches-date-nav";
import { BranchesMonthNav } from "./branches-month-nav";
import { BranchesList } from "./branches-list";
import { BranchesWeekly } from "./branches-weekly";
import { BranchesMonthly } from "./branches-monthly";
import { withParam } from "./url";

export function BranchesTabs({
  tab,
  date,
  hasExplicitDate,
  month,
  hasExplicitMonth,
  ownClubId,
  branches,
  coachCups,
  weeklySummary,
  monthlySummary,
  leaderboards,
}: {
  tab: string;
  date: string;
  hasExplicitDate: boolean;
  month: string;
  hasExplicitMonth: boolean;
  ownClubId: string | null;
  branches: BranchDailySummaryRow[];
  coachCups: BranchCoachCupsCompareRow[];
  weeklySummary: BranchWeeklySummaryRow[];
  monthlySummary: BranchMonthlySummaryRow[];
  leaderboards: BranchLeaderboardRow[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function goToTab(next: string) {
    router.push(`/branches?${withParam(searchParams, "tab", next)}`);
  }

  return (
    <Tabs value={tab} onValueChange={(v) => goToTab(String(v))} className="mt-4">
      <TabsList>
        <TabsTrigger value="daily">Daily</TabsTrigger>
        <TabsTrigger value="weekly">Weekly</TabsTrigger>
        <TabsTrigger value="monthly">Monthly</TabsTrigger>
      </TabsList>

      <TabsContent value="daily" className="mt-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            Numbers below are for {format(parseISO(date), "EEEE, d MMM yyyy")}, compared against
            each club&apos;s own previous operating day.
          </p>
          <BranchesDateNav date={date} hasExplicitDate={hasExplicitDate} />
        </div>
        <BranchesList
          branches={branches}
          coachCups={coachCups}
          ownClubId={ownClubId}
          date={date}
          month={month}
        />
      </TabsContent>

      <TabsContent value="weekly" className="mt-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            Each club&apos;s own most recent 6 operating days, ending {format(parseISO(date), "d MMM yyyy")}.
          </p>
          <BranchesDateNav date={date} hasExplicitDate={hasExplicitDate} />
        </div>
        <BranchesWeekly summary={weeklySummary} ownClubId={ownClubId} date={date} month={month} />
      </TabsContent>

      <TabsContent value="monthly" className="mt-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            Averages and totals for {format(parseISO(`${month}-01`), "MMMM yyyy")}, plus
            leaderboards across your own club and every sponsored branch.
          </p>
          <BranchesMonthNav month={month} hasExplicitMonth={hasExplicitMonth} />
        </div>
        <BranchesMonthly summary={monthlySummary} leaderboards={leaderboards} ownClubId={ownClubId} />
      </TabsContent>
    </Tabs>
  );
}
