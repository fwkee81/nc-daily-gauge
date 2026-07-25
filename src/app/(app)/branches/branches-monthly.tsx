"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type {
  BranchLeaderboardRow,
  BranchMonthlySummaryRow,
  BranchNewRenewalRow,
  CustomerNcLevel,
} from "@/lib/types/database";

const RANK_MEDAL = ["🥇", "🥈", "🥉"];

// The 4 stats that drill down into a customer list — value column keeps
// this key so BranchesMonthly can look their breakdown up in newRenewalsByKey.
const NEW_RENEWAL_LEVELS: { level: CustomerNcLevel; label: string }[] = [
  { level: "5-day", label: "5-Day" },
  { level: "10-day", label: "10-Day" },
  { level: "20-day", label: "20-Day" },
  { level: "30-day", label: "30-Day" },
];

export function BranchesMonthly({
  summary,
  newRenewals,
  leaderboards,
  ownClubId,
}: {
  summary: BranchMonthlySummaryRow[];
  newRenewals: BranchNewRenewalRow[];
  leaderboards: BranchLeaderboardRow[];
  ownClubId: string | null;
}) {
  const [expandedClubId, setExpandedClubId] = useState<string | null>(null);
  const [breakdownOpen, setBreakdownOpen] = useState<{
    clubName: string;
    label: string;
    rows: BranchNewRenewalRow[];
  } | null>(null);

  const coachCupAvgByClub = useMemo(() => {
    const map = new Map<string, BranchLeaderboardRow[]>();
    for (const row of leaderboards) {
      if (row.board !== "coach_cup_avg") continue;
      if (!map.has(row.club_id)) map.set(row.club_id, []);
      map.get(row.club_id)!.push(row);
    }
    return map;
  }, [leaderboards]);

  const newRenewalsByKey = useMemo(() => {
    const map = new Map<string, BranchNewRenewalRow[]>();
    for (const row of newRenewals) {
      const key = `${row.club_id}::${row.nc_level}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(row);
    }
    return map;
  }, [newRenewals]);

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
          const isExpanded = expandedClubId === row.club_id;
          const clubCoachCups = coachCupAvgByClub.get(row.club_id) ?? [];
          const statByLevel: Record<CustomerNcLevel, number | undefined> = {
            "5-day": row.total_5day,
            "10-day": row.total_10day,
            "20-day": row.total_20day,
            "30-day": row.total_30day,
            "Ala Carte": undefined,
          };

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
                  <button
                    type="button"
                    className="rounded-md border px-3 py-2 text-left transition-colors hover:bg-accent"
                    onClick={() =>
                      setExpandedClubId((current) => (current === row.club_id ? null : row.club_id))
                    }
                  >
                    <p className="flex items-center gap-1 text-xs text-muted-foreground">
                      {isExpanded ? (
                        <ChevronDown className="size-3" />
                      ) : (
                        <ChevronRight className="size-3" />
                      )}
                      Avg Coach&apos;s Cup / Day
                    </p>
                    <p className="text-lg font-semibold">{row.coach_cup_avg_daily}</p>
                  </button>
                  {NEW_RENEWAL_LEVELS.map(({ level, label }) => {
                    const value = statByLevel[level];
                    if (value === undefined) return null;
                    const rows = newRenewalsByKey.get(`${row.club_id}::${level}`) ?? [];
                    return (
                      <Stat
                        key={level}
                        label={label}
                        value={value}
                        onClick={() => setBreakdownOpen({ clubName: row.club_name, label, rows })}
                      />
                    );
                  })}
                  <Stat label="Consumption VP" value={row.consumption_vp} decimals={2} />
                </div>

                {isExpanded && (
                  <div className="mt-3 rounded-md border">
                    {clubCoachCups.length === 0 ? (
                      <p className="p-3 text-sm text-muted-foreground">
                        No qualifying check-ins for this club.
                      </p>
                    ) : (
                      <ul className="divide-y">
                        {clubCoachCups.map((c) => (
                          <li
                            key={c.coach_id}
                            className="flex items-center justify-between px-3 py-1.5 text-sm"
                          >
                            <span>{c.coach_name}</span>
                            <span className="text-muted-foreground">{c.value} cups/day</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div>
        <h2 className="text-lg font-semibold">Leaderboards</h2>
        <div className="mt-3 grid gap-4 md:grid-cols-3">
          <Leaderboard
            title="Most New 5-Day Sign-ups"
            rows={new5day}
            formatValue={(v) => String(v)}
            unit="new"
          />
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

      <Dialog open={!!breakdownOpen} onOpenChange={(open) => !open && setBreakdownOpen(null)}>
        <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {breakdownOpen?.clubName} — {breakdownOpen?.label}
            </DialogTitle>
          </DialogHeader>
          <ul className="divide-y">
            {breakdownOpen?.rows.map((r, i) => (
              <li
                key={`${r.customer_name}-${r.created_at}-${i}`}
                className="flex items-center justify-between py-2 text-sm"
              >
                <span className="flex items-center gap-1.5">
                  {r.kind === "new" ? <Badge>New</Badge> : <Badge variant="secondary">Renewal</Badge>}
                  {r.customer_name}
                </span>
                <span className="text-muted-foreground">{r.coach_name ?? "—"}</span>
              </li>
            ))}
            {breakdownOpen?.rows.length === 0 && (
              <p className="py-4 text-center text-sm text-muted-foreground">No customers yet.</p>
            )}
          </ul>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Stat({
  label,
  value,
  decimals,
  onClick,
}: {
  label: string;
  value: number;
  decimals?: number;
  onClick?: () => void;
}) {
  const content = (
    <>
      <p className="flex items-center gap-1 text-xs text-muted-foreground">
        {onClick && <ChevronRight className="size-3" />}
        {label}
      </p>
      <p className="text-lg font-semibold">
        {decimals != null ? Number(value).toFixed(decimals) : value}
      </p>
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        className="rounded-md border px-3 py-2 text-left transition-colors hover:bg-accent"
        onClick={onClick}
      >
        {content}
      </button>
    );
  }

  return <div className="rounded-md border px-3 py-2">{content}</div>;
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
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No activity yet this month.</p>
        ) : (
          <ol className="space-y-1">
            {rows.map((row, i) => (
              <li
                key={row.coach_id}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-2.5 py-2",
                  i === 0 ? "bg-primary/10" : "hover:bg-accent/50"
                )}
              >
                <span className="flex w-6 shrink-0 items-center justify-center text-base">
                  {i < 3 ? (
                    RANK_MEDAL[i]
                  ) : (
                    <span className="text-xs font-semibold text-muted-foreground">{i + 1}</span>
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm leading-tight font-medium">{row.coach_name}</p>
                  <p className="truncate text-xs leading-tight text-muted-foreground">
                    {row.club_name}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm leading-tight font-semibold">{formatValue(row.value)}</p>
                  <p className="text-[10px] leading-tight text-muted-foreground">{unit}</p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
