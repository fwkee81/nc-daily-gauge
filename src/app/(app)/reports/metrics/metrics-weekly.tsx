"use client";

import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { format, parseISO } from "date-fns";
import { cn } from "@/lib/utils";
import { getMilestoneTier } from "@/lib/cup-milestones";
import type {
  CustomerNcLevel,
  WeeklyCoachCupRow,
  WeeklyCustomerAttendanceRow,
  WeeklyNewRenewalRow,
  WeeklyTotalsRow,
} from "@/lib/types/database";

// Same 4 stats as Branches Weekly — value column keeps this key so we can
// look their breakdown up in newRenewalsByLevel.
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

function DailyBars({ daily }: { daily: WeeklyTotalsRow["daily"] }) {
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

export function MetricsWeekly({
  totals,
  newRenewals,
  attendance,
  coachCups,
}: {
  totals: WeeklyTotalsRow;
  newRenewals: WeeklyNewRenewalRow[];
  attendance: WeeklyCustomerAttendanceRow[];
  coachCups: WeeklyCoachCupRow[];
}) {
  const [breakdownOpen, setBreakdownOpen] = useState<{ label: string; rows: WeeklyNewRenewalRow[] } | null>(
    null
  );
  const [coachCupOpen, setCoachCupOpen] = useState(false);
  const hasActivity = totals.operating_days > 0;

  const statByLevel: Record<CustomerNcLevel, number | undefined> = {
    "5-day": totals.total_5day,
    "10-day": totals.total_10day,
    "20-day": totals.total_20day,
    "30-day": totals.total_30day,
    "Ala Carte": undefined,
  };

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        {hasActivity ? (
          <>
            Last {totals.operating_days} operating day{totals.operating_days === 1 ? "" : "s"}
            {totals.window_start &&
              totals.window_end &&
              ` · ${format(parseISO(totals.window_start), "d MMM")} – ${format(parseISO(totals.window_end), "d MMM")}`}
          </>
        ) : (
          "No check-ins in this window yet."
        )}
      </p>

      <DailyBars daily={totals.daily} />

      <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
        <Stat label="Total Cups" value={totals.total_cups} />
        <Stat
          label="Coach's Cup"
          value={totals.coach_cup_total}
          onClick={() => setCoachCupOpen(true)}
        />
        {NEW_RENEWAL_LEVELS.map(({ level, label }) => {
          const value = statByLevel[level];
          if (value === undefined) return null;
          const rows = newRenewals.filter((r) => r.nc_level === level);
          return (
            <Stat
              key={level}
              label={label}
              value={value}
              onClick={() => setBreakdownOpen({ label, rows })}
            />
          );
        })}
        <Stat label="Consumption VP" value={totals.consumption_vp} decimals={2} />
      </div>

      <div>
        <h2 className="text-lg font-semibold">Customers This Week</h2>
        <p className="text-sm text-muted-foreground">
          Everyone who checked in during this window, most visits first — blank means they
          didn&apos;t come in that day.
        </p>
        <div className="mt-2 overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Customer</TableHead>
                <TableHead>Coach</TableHead>
                <TableHead>NC Level</TableHead>
                {totals.daily.map((d) => (
                  <TableHead key={d.date} className="text-center">
                    <div className="flex flex-col items-center leading-tight">
                      <span>{format(parseISO(d.date), "d MMM")}</span>
                      <span className="text-[11px] font-normal text-muted-foreground">
                        {format(parseISO(d.date), "EEE")}
                      </span>
                    </div>
                  </TableHead>
                ))}
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {attendance.map((row) => {
                const daysAttended = Object.keys(row.daily).length;
                const windowDays = totals.daily.length;
                const perfectAttendance = windowDays > 0 && daysAttended === windowDays;
                // One day short of perfect still deserves a small nod — a
                // step below the flame, not the flame itself.
                const almostPerfect = windowDays > 1 && daysAttended === windowDays - 1;
                return (
                  <TableRow key={row.customer_id} className={cn(perfectAttendance && "bg-primary/5")}>
                    <TableCell>{row.customer_name}</TableCell>
                    <TableCell>{row.coach_name ?? "—"}</TableCell>
                    <TableCell>{row.nc_level}</TableCell>
                    {totals.daily.map((d) => {
                      const count = row.daily[d.date];
                      return (
                        <TableCell key={d.date} className="text-center">
                          {count && (
                            <span
                              className={cn(
                                "inline-flex size-6 items-center justify-center rounded-full text-xs font-semibold",
                                count >= 2 ? "bg-primary/25 text-primary" : "bg-primary/10 text-primary"
                              )}
                            >
                              {count}
                            </span>
                          )}
                        </TableCell>
                      );
                    })}
                    <TableCell className="text-right">
                      <span className="inline-flex items-center gap-1 font-semibold">
                        {row.visit_count}
                        {perfectAttendance && <span title={`Came in every day this window (${windowDays}/${windowDays})`}>🔥</span>}
                        {almostPerfect && (
                          <span title={`Came in ${daysAttended} of ${windowDays} days this window`}>🌸</span>
                        )}
                      </span>
                    </TableCell>
                  </TableRow>
                );
              })}
              {attendance.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4 + totals.daily.length} className="text-center text-muted-foreground">
                    No check-ins in this window yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <Dialog open={!!breakdownOpen} onOpenChange={(open) => !open && setBreakdownOpen(null)}>
        <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{breakdownOpen?.label}</DialogTitle>
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

      <Dialog open={coachCupOpen} onOpenChange={setCoachCupOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Coach&apos;s Cup — average per coach</DialogTitle>
          </DialogHeader>
          <ul className="divide-y">
            {coachCups.map((c) => (
              <li key={c.coach_id} className="flex items-center justify-between py-2 text-sm">
                <span>{c.coach_name}</span>
                <span className="flex items-center gap-2">
                  <span className="text-muted-foreground">{c.total_cups} cups</span>
                  <span className="font-semibold">{c.avg_cups_per_day.toFixed(2)}/day</span>
                </span>
              </li>
            ))}
            {coachCups.length === 0 && (
              <p className="py-4 text-center text-sm text-muted-foreground">No coach&apos;s cup check-ins yet.</p>
            )}
          </ul>
        </DialogContent>
      </Dialog>
    </div>
  );
}
