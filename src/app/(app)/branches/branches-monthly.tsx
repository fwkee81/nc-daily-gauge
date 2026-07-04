"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { BranchLeaderboardRow, BranchMonthlySummaryRow } from "@/lib/types/database";

export function BranchesMonthly({
  summary,
  leaderboards,
  ownClubId,
}: {
  summary: BranchMonthlySummaryRow[];
  leaderboards: BranchLeaderboardRow[];
  ownClubId: string | null;
}) {
  if (summary.length === 0) {
    return (
      <p className="mt-6 text-sm text-muted-foreground">
        Nothing to show yet — this shows up once your club is registered.
      </p>
    );
  }

  const new5day = leaderboards.filter((r) => r.board === "new_5day").slice(0, 10);
  const total30day = leaderboards.filter((r) => r.board === "total_30day").slice(0, 10);
  const coachCupAvg = leaderboards.filter((r) => r.board === "coach_cup_avg").slice(0, 10);

  return (
    <div className="mt-6 space-y-6">
      <div className="space-y-3">
        {summary.map((row) => {
          const isOwn = row.club_id === ownClubId;
          return (
            <Card key={row.club_id}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  {row.club_name}
                  {isOwn && <Badge>Your club</Badge>}
                </CardTitle>
                <CardDescription>
                  {row.operating_days} operating day{row.operating_days === 1 ? "" : "s"} this month
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
                  <Stat label="Avg Cups / Day" value={row.avg_daily_cups} />
                  <Stat label="Avg Coach's Cup / Day" value={row.coach_cup_avg_daily} />
                  <Stat label="5-Day" value={row.total_5day} />
                  <Stat label="10-Day" value={row.total_10day} />
                  <Stat label="20-Day" value={row.total_20day} />
                  <Stat label="30-Day" value={row.total_30day} />
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div>
        <h2 className="text-lg font-semibold">Leaderboards</h2>
        <div className="mt-3 grid gap-4 md:grid-cols-3">
          <Leaderboard title="Most New 5-Day Sign-ups" rows={new5day} formatValue={(v) => String(v)} unit="new" />
          <Leaderboard
            title="Most 30-Day Activity"
            rows={total30day}
            formatValue={(v) => String(v)}
            unit="customers"
          />
          <Leaderboard
            title="Highest Avg Coach's Cup"
            rows={coachCupAvg}
            formatValue={(v) => v.toFixed(2)}
            unit="cups/day"
          />
        </div>
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

function Leaderboard({
  title,
  rows,
  formatValue,
  unit,
}: {
  title: string;
  rows: BranchLeaderboardRow[];
  formatValue: (v: number) => string;
  unit: string;
}) {
  return (
    <div className="rounded-md border">
      <div className="border-b px-4 py-3">
        <h3 className="font-semibold">{title}</h3>
      </div>
      {rows.length === 0 ? (
        <p className="p-4 text-sm text-muted-foreground">No activity yet this month.</p>
      ) : (
        <ol className="divide-y">
          {rows.map((row, i) => (
            <li key={row.coach_id} className="flex items-center justify-between px-4 py-2 text-sm">
              <span className="flex items-center gap-2">
                <span className="text-muted-foreground">#{i + 1}</span>
                <span>
                  <span className="font-medium">{row.coach_name}</span>
                  <span className="ml-1 text-xs text-muted-foreground">{row.club_name}</span>
                </span>
              </span>
              <span className="font-semibold">
                {formatValue(row.value)} {unit}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
