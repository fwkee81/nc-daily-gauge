"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { addMonths, format, parse } from "date-fns";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { MonthlyPackageSaleRow } from "@/lib/types/database";

interface CoachCupRow {
  coach_id: string;
  coach_name: string;
  total_cups: number;
  avg_daily_cups: number;
}

export function MetricsClient({
  month,
  hasExplicitMonth,
  clubId,
  clubName,
  viewingBranch,
  totals,
  coachCups,
  packageSales,
}: {
  month: string;
  hasExplicitMonth: boolean;
  clubId: string;
  clubName: string | null;
  viewingBranch: boolean;
  totals: { total_cups: number; days_in_period: number; avg_daily_cups: number };
  coachCups: CoachCupRow[];
  packageSales: MonthlyPackageSaleRow[];
}) {
  const router = useRouter();
  const parsedMonth = parse(month, "yyyy-MM", new Date());

  // Same "server thinks it's UTC" issue as Daily Report: self-correct to the
  // browser's local month if none was explicitly requested.
  useEffect(() => {
    if (hasExplicitMonth) return;
    const clientMonth = format(new Date(), "yyyy-MM");
    if (clientMonth !== month) {
      const clubQuery = viewingBranch ? `&club=${clubId}` : "";
      router.replace(`/reports/metrics?month=${clientMonth}${clubQuery}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function goToMonth(m: string) {
    const clubQuery = viewingBranch ? `&club=${clubId}` : "";
    router.push(`/reports/metrics?month=${m}${clubQuery}`);
  }

  return (
    <div className="space-y-6">
      {viewingBranch && (
        <div className="flex items-center justify-between rounded-md border bg-secondary/15 px-4 py-2 text-sm">
          <span>
            Viewing branch <strong>{clubName}</strong> — not merged with your own club.
          </span>
          <Link href="/reports/metrics" className="underline underline-offset-4">
            Back to my club
          </Link>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">
          NC Metrics{clubName ? ` — ${clubName}` : ""} · {format(parsedMonth, "MMMM yyyy")}
        </h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => goToMonth(format(addMonths(parsedMonth, -1), "yyyy-MM"))}>
            ← Prev month
          </Button>
          <Input
            type="month"
            className="w-auto"
            value={month}
            onChange={(e) => goToMonth(e.target.value)}
          />
          <Button variant="outline" size="sm" onClick={() => goToMonth(format(addMonths(parsedMonth, 1), "yyyy-MM"))}>
            Next month →
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardDescription>Total Cups this month</CardDescription>
            <CardTitle className="text-3xl">{totals.total_cups}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>
              Average NC Cups / operating day ({totals.days_in_period} operating day
              {totals.days_in_period === 1 ? "" : "s"})
            </CardDescription>
            <CardTitle className="text-3xl">{totals.avg_daily_cups}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <div>
        <h2 className="text-lg font-semibold">Average Coach Cups</h2>
        <div className="mt-2 overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Coach</TableHead>
                <TableHead className="text-right">Total cups</TableHead>
                <TableHead className="text-right">Avg / operating day</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {coachCups.map((row) => (
                <TableRow key={row.coach_id}>
                  <TableCell>{row.coach_name}</TableCell>
                  <TableCell className="text-right">{row.total_cups}</TableCell>
                  <TableCell className="text-right">{row.avg_daily_cups}</TableCell>
                </TableRow>
              ))}
              {coachCups.length === 0 && (
                <TableRow>
                  <TableCell colSpan={3} className="text-center text-muted-foreground">
                    No qualifying check-ins this month.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <PackageSalesSection
        title="New 5-Day Trial"
        rows={packageSales.filter((r) => r.nc_level === "5-day")}
      />
      <PackageSalesSection
        title="10-Day"
        rows={packageSales.filter((r) => r.nc_level === "10-day")}
      />
      <PackageSalesSection
        title="20-Day"
        rows={packageSales.filter((r) => r.nc_level === "20-day")}
      />
      <PackageSalesSection
        title="30-Day"
        rows={packageSales.filter((r) => r.nc_level === "30-day")}
      />
    </div>
  );
}

// No coach assigned: label it "Plug-in" when that's also who invited them
// (the common case — a walk-through customer with no coach relationship at
// all), otherwise fall back to "Unassigned" so a coach-invited customer
// that's simply missing a Coach field isn't mislabeled as Plug-in.
function unassignedLabel(r: MonthlyPackageSaleRow) {
  return r.invited_by_type === "plugin" ? "Plug-in" : "Unassigned";
}

function groupByCoach(rows: MonthlyPackageSaleRow[]) {
  const map = new Map<string, { coachName: string; entries: MonthlyPackageSaleRow[] }>();
  for (const r of rows) {
    const key = r.coach_id ?? unassignedLabel(r);
    const coachName = r.coach_name ?? unassignedLabel(r);
    if (!map.has(key)) map.set(key, { coachName, entries: [] });
    map.get(key)!.entries.push(r);
  }
  return [...map.entries()]
    .map(([coachKey, v]) => ({ coachKey, coachName: v.coachName, entries: v.entries }))
    .sort((a, b) => b.entries.length - a.entries.length);
}

// Same expand-per-coach interaction as Daily Report's Coach's Cup, for a
// consistent feel across both report pages.
function PackageSalesSection({ title, rows }: { title: string; rows: MonthlyPackageSaleRow[] }) {
  const [expandedCoachKey, setExpandedCoachKey] = useState<string | null>(null);
  const groups = useMemo(() => groupByCoach(rows), [rows]);

  return (
    <div>
      <h2 className="text-lg font-semibold">
        {title} — Total: {rows.length}
      </h2>
      <div className="mt-2 overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Coach</TableHead>
              <TableHead className="text-right">Count</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {groups.map((g) => {
              const isExpanded = expandedCoachKey === g.coachKey;
              return (
                <Fragment key={g.coachKey}>
                  <TableRow
                    className={cn(
                      "cursor-pointer hover:bg-accent/50",
                      isExpanded && "border-l-4 border-l-primary bg-primary/5 hover:bg-primary/10"
                    )}
                    onClick={() =>
                      setExpandedCoachKey((current) => (current === g.coachKey ? null : g.coachKey))
                    }
                  >
                    <TableCell>
                      <span
                        className={cn(
                          "inline-flex items-center gap-1",
                          isExpanded && "font-semibold text-primary"
                        )}
                      >
                        {isExpanded ? (
                          <ChevronDown className="size-3.5" />
                        ) : (
                          <ChevronRight className="size-3.5 text-muted-foreground" />
                        )}
                        {g.coachName}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">{g.entries.length}</TableCell>
                  </TableRow>
                  {isExpanded && (
                    <TableRow className="border-l-4 border-l-primary">
                      <TableCell colSpan={2} className="bg-primary/5 p-0">
                        <ul className="divide-y divide-primary/10">
                          {g.entries.map((entry) => (
                            <li
                              key={`${entry.customer_id}-${entry.entry_date}-${entry.kind}`}
                              className="flex items-center justify-between py-1.5 pr-3 pl-8 text-sm"
                            >
                              <span className="flex items-center gap-2">
                                {entry.customer_name}
                                <Badge
                                  variant={entry.kind === "new" ? "secondary" : "outline"}
                                  className="text-[0.65rem]"
                                >
                                  {entry.kind === "new" ? "New" : "Renewed"}
                                </Badge>
                              </span>
                              <span className="text-muted-foreground">
                                {format(new Date(entry.entry_date), "d MMM")}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              );
            })}
            {groups.length === 0 && (
              <TableRow>
                <TableCell colSpan={2} className="text-center text-muted-foreground">
                  No activity this month.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
