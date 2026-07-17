"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { format, parseISO } from "date-fns";
import type { BranchWeeklyDailyRow, BranchWeeklySummaryRow } from "@/lib/types/database";

function Stat({
  label,
  value,
  decimals = 0,
}: {
  label: string;
  value: number;
  decimals?: number;
}) {
  return (
    <div className="rounded-md border px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold">{Number(value).toFixed(decimals)}</p>
    </div>
  );
}

const BAR_HEIGHT_PX = 64;

function DailyBars({ daily }: { daily: BranchWeeklyDailyRow[] }) {
  if (daily.length === 0) return null;
  const max = Math.max(...daily.map((d) => d.total_cups), 1);

  return (
    <div
      className="mb-4 grid items-end gap-2 rounded-md border bg-muted/30 p-3"
      style={{ gridTemplateColumns: `repeat(${daily.length}, minmax(0, 1fr))` }}
    >
      {daily.map((d) => (
        <div key={d.date} className="flex flex-col items-center gap-1">
          <span className="text-xs font-medium">{d.total_cups}</span>
          <div
            className="flex w-full items-end justify-center"
            style={{ height: BAR_HEIGHT_PX }}
          >
            <div
              className="w-6 rounded-t bg-primary"
              style={{ height: Math.max(4, Math.round((d.total_cups / max) * BAR_HEIGHT_PX)) }}
              title={`${format(parseISO(d.date), "d MMM")} · ${d.total_cups} cups`}
            />
          </div>
          <span className="text-[11px] text-muted-foreground">
            {format(parseISO(d.date), "EEE")}
          </span>
        </div>
      ))}
    </div>
  );
}

export function BranchesWeekly({
  summary,
  ownClubId,
  date,
  month,
}: {
  summary: BranchWeeklySummaryRow[];
  ownClubId: string | null;
  date: string;
  month: string;
}) {
  if (summary.length === 0) {
    return (
      <p className="mt-6 text-sm text-muted-foreground">
        Nothing to show yet — this shows up once your club is registered.
      </p>
    );
  }

  return (
    <div className="mt-6 space-y-3">
      {summary.map((branch) => {
        const isOwn = branch.club_id === ownClubId;
        const hasActivity = branch.operating_days > 0;

        return (
          <Card key={branch.club_id}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {branch.club_name}
                {isOwn && <Badge>Your club</Badge>}
              </CardTitle>
              <CardDescription>
                {hasActivity ? (
                  <>
                    Last {branch.operating_days} operating day
                    {branch.operating_days === 1 ? "" : "s"}
                    {branch.window_start &&
                      branch.window_end &&
                      ` · ${format(parseISO(branch.window_start), "d MMM")} – ${format(parseISO(branch.window_end), "d MMM")}`}
                  </>
                ) : (
                  "No check-ins yet"
                )}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <DailyBars daily={branch.daily} />
              <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
                <Stat label="Total Cups" value={branch.total_cups} />
                <Stat label="Coach's Cup" value={branch.coach_cup_total} />
                <Stat label="New 5-Day" value={branch.total_5day} />
                <Stat label="10-Day" value={branch.total_10day} />
                <Stat label="20-Day" value={branch.total_20day} />
                <Stat label="30-Day" value={branch.total_30day} />
                <Stat label="Consumption VP" value={branch.consumption_vp} decimals={2} />
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
              <Link
                href={`/wellness-report?club=${branch.club_id}`}
                className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm transition-colors hover:bg-accent"
              >
                Wellness Report <ChevronRight className="size-4 text-muted-foreground" />
              </Link>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
