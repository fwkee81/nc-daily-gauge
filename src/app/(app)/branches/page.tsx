import Link from "next/link";
import { redirect } from "next/navigation";
import { format, parseISO } from "date-fns";
import { ChevronRight } from "lucide-react";
import { getCurrentCoach } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { BranchDailySummaryRow } from "@/lib/types/database";
import { BranchesDateNav } from "./branches-date-nav";

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
  const { data } = await supabase.rpc("branches_daily_summary", { p_date: date });
  const branches = (data ?? []) as BranchDailySummaryRow[];

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Branches</h1>
        <BranchesDateNav date={date} hasExplicitDate={Boolean(dateParam)} />
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Nutrition clubs whose Owner named you as their sponsor. Numbers below are for{" "}
        {format(parseISO(date), "EEEE, d MMM yyyy")} — each branch&apos;s numbers are shown on
        their own, never merged with your own club.
      </p>

      <div className="mt-6 space-y-3">
        {branches.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No branches yet. Once another club&apos;s Owner registers and picks you as their
            sponsor, they&apos;ll show up here.
          </p>
        )}
        {branches.map((branch) => (
          <Card key={branch.club_id}>
            <CardHeader>
              <CardTitle>{branch.club_name}</CardTitle>
              <CardDescription>Read-only — never merged with your own club</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
                <Stat label="Total Cups" value={branch.total_cups} />
                <Stat label="Coach's Cup" value={branch.coach_cup_total} />
                <Stat label="New 5-Day" value={branch.new_5day} />
                <Stat label="10-Day" value={branch.total_10day} />
                <Stat label="20-Day" value={branch.total_20day} />
                <Stat label="30-Day" value={branch.total_30day} />
              </div>
            </CardContent>
            <div className="flex flex-wrap gap-2 px-6 pb-6">
              <Link
                href={`/reports/daily?club=${branch.club_id}&date=${date}`}
                className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm transition-colors hover:bg-accent"
              >
                Daily Report <ChevronRight className="size-4 text-muted-foreground" />
              </Link>
              <Link
                href={`/reports/metrics?club=${branch.club_id}&month=${month}`}
                className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm transition-colors hover:bg-accent"
              >
                NC Metrics <ChevronRight className="size-4 text-muted-foreground" />
              </Link>
              <Link
                href={`/admin/customers?club=${branch.club_id}`}
                className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm transition-colors hover:bg-accent"
              >
                Customers <ChevronRight className="size-4 text-muted-foreground" />
              </Link>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold">{value}</p>
    </div>
  );
}
