"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { format, parseISO } from "date-fns";
import { getMilestoneTier } from "@/lib/cup-milestones";
import type {
  BranchNewRenewalRow,
  BranchWeeklyDailyRow,
  BranchWeeklySummaryRow,
  CustomerNcLevel,
} from "@/lib/types/database";

// The 4 stats that drill down into a customer list — value column keeps
// this key so BranchesWeekly can look their breakdown up in newRenewalsByKey.
const NEW_RENEWAL_LEVELS: { level: CustomerNcLevel; label: string }[] = [
  { level: "5-day", label: "New 5-Day" },
  { level: "10-day", label: "10-Day" },
  { level: "20-day", label: "20-Day" },
  { level: "30-day", label: "30-Day" },
];

function Stat({
  label,
  value,
  decimals = 0,
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
      <p className="text-lg font-semibold">{Number(value).toFixed(decimals)}</p>
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

const BAR_HEIGHT_PX = 64;

function DailyBars({ daily }: { daily: BranchWeeklyDailyRow[] }) {
  if (daily.length === 0) return null;
  const max = Math.max(...daily.map((d) => d.total_cups), 1);

  return (
    <div
      className="mb-4 grid items-end gap-2 rounded-md border bg-muted/30 p-3"
      style={{ gridTemplateColumns: `repeat(${daily.length}, minmax(0, 1fr))` }}
    >
      {daily.map((d) => {
        const tierEmoji = getMilestoneTier(d.total_cups)?.emoji;
        return (
          <div key={d.date} className="flex flex-col items-center gap-1">
            <span className="flex items-center gap-0.5 text-xs font-medium">
              {d.total_cups}
              {tierEmoji && <span aria-hidden>{tierEmoji}</span>}
            </span>
            <div className="flex w-full items-end justify-center" style={{ height: BAR_HEIGHT_PX }}>
              <div
                className="w-6 rounded-t bg-primary"
                style={{ height: Math.max(4, Math.round((d.total_cups / max) * BAR_HEIGHT_PX)) }}
                title={`${format(parseISO(d.date), "d MMM")} · ${d.total_cups} cups`}
              />
            </div>
            <span className="text-[11px] text-muted-foreground">{format(parseISO(d.date), "EEE")}</span>
          </div>
        );
      })}
    </div>
  );
}

export function BranchesWeekly({
  summary,
  newRenewals,
  ownClubId,
  date,
  month,
}: {
  summary: BranchWeeklySummaryRow[];
  newRenewals: BranchNewRenewalRow[];
  ownClubId: string | null;
  date: string;
  month: string;
}) {
  const [breakdownOpen, setBreakdownOpen] = useState<{
    clubName: string;
    label: string;
    rows: BranchNewRenewalRow[];
  } | null>(null);

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

  return (
    <div className="mt-6 space-y-3">
      {summary.map((branch) => {
        const isOwn = branch.club_id === ownClubId;
        const hasActivity = branch.operating_days > 0;
        const statByLevel: Record<CustomerNcLevel, number | undefined> = {
          "5-day": branch.total_5day,
          "10-day": branch.total_10day,
          "20-day": branch.total_20day,
          "30-day": branch.total_30day,
          "Ala Carte": undefined,
        };

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
                {NEW_RENEWAL_LEVELS.map(({ level, label }) => {
                  const value = statByLevel[level];
                  if (value === undefined) return null;
                  const rows = newRenewalsByKey.get(`${branch.club_id}::${level}`) ?? [];
                  return (
                    <Stat
                      key={level}
                      label={label}
                      value={value}
                      onClick={() => setBreakdownOpen({ clubName: branch.club_name, label, rows })}
                    />
                  );
                })}
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
