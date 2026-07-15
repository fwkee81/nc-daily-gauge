"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { format, parseISO } from "date-fns";
import type { BranchWeeklySummaryRow } from "@/lib/types/database";

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold">{value}</p>
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
              <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
                <Stat label="Total Cups" value={branch.total_cups} />
                <Stat label="Coach's Cup" value={branch.coach_cup_total} />
                <Stat label="New 5-Day" value={branch.total_5day} />
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
        );
      })}
    </div>
  );
}
