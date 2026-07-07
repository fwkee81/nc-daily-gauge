"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { addMonths, differenceInYears, format, parse } from "date-fns";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type {
  CustomerGender,
  CustomerNcLevel,
  InvitedByType,
  MonthlyPackageSaleRow,
} from "@/lib/types/database";

interface CoachCupRow {
  coach_id: string;
  coach_name: string;
  total_cups: number;
  avg_daily_cups: number;
}

interface DemographicsCustomer {
  id: string;
  name: string;
  gender: CustomerGender;
  dob: string | null;
  age_override: number | null;
  nc_level: CustomerNcLevel;
  member_id: string | null;
  invited_by_type: InvitedByType;
  invited_by_customer_id: string | null;
}

export function MetricsClient({
  month,
  hasExplicitMonth,
  clubId,
  clubName,
  viewingBranch,
  tab,
  totals,
  coachCups,
  packageSales,
  customers,
}: {
  month: string;
  hasExplicitMonth: boolean;
  clubId: string;
  clubName: string | null;
  viewingBranch: boolean;
  tab: "activity" | "demographics";
  totals: { total_cups: number; days_in_period: number; avg_daily_cups: number };
  coachCups: CoachCupRow[];
  packageSales: MonthlyPackageSaleRow[];
  customers: DemographicsCustomer[];
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

  function goToTab(t: string) {
    const clubQuery = viewingBranch ? `&club=${clubId}` : "";
    router.push(`/reports/metrics?month=${month}&tab=${t}${clubQuery}`);
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

      <Tabs value={tab} onValueChange={(v) => goToTab(String(v))}>
        <TabsList>
          <TabsTrigger value="activity">Activity</TabsTrigger>
          <TabsTrigger value="demographics">Customer Demographics</TabsTrigger>
        </TabsList>

        <TabsContent value="activity" className="mt-4 space-y-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <Card className="border-2 border-primary bg-primary/5">
              <CardHeader>
                <CardDescription>Total Cups this month</CardDescription>
                <CardTitle className="text-3xl font-bold text-primary">{totals.total_cups}</CardTitle>
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
        </TabsContent>

        <TabsContent value="demographics" className="mt-4">
          <DemographicsTab customers={customers} parsedMonth={parsedMonth} />
        </TabsContent>
      </Tabs>
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

const GENDER_ORDER: CustomerGender[] = ["Male", "Female", "Couple", "Family", "Others"];

const AGE_BUCKETS = ["18-25", "26-35", "36-45", "46-55", "56-65", "66-75", "76 & above"] as const;

function ageOf(c: DemographicsCustomer): number | null {
  if (c.age_override != null) return c.age_override;
  if (!c.dob) return null;
  return differenceInYears(new Date(), new Date(c.dob));
}

function ageBucket(age: number): (typeof AGE_BUCKETS)[number] {
  if (age <= 25) return "18-25";
  if (age <= 35) return "26-35";
  if (age <= 45) return "36-45";
  if (age <= 55) return "46-55";
  if (age <= 65) return "56-65";
  if (age <= 75) return "66-75";
  return "76 & above";
}

function genderBreakdown(customers: DemographicsCustomer[]) {
  const counts = new Map<string, number>();
  for (const c of customers) {
    counts.set(c.gender, (counts.get(c.gender) ?? 0) + 1);
  }
  const total = customers.length;
  return GENDER_ORDER.filter((g) => counts.has(g)).map((g) => {
    const count = counts.get(g)!;
    return { gender: g, count, pct: total > 0 ? Math.round((count / total) * 100) : 0 };
  });
}

function ageStats(customers: DemographicsCustomer[]) {
  const ages = customers.map(ageOf).filter((a): a is number => a != null);
  const average = ages.length > 0 ? Math.round(ages.reduce((sum, a) => sum + a, 0) / ages.length) : null;

  const counts = new Map<string, number>();
  for (const age of ages) {
    const bucket = ageBucket(age);
    counts.set(bucket, (counts.get(bucket) ?? 0) + 1);
  }
  const buckets = AGE_BUCKETS.map((b) => {
    const count = counts.get(b) ?? 0;
    return { bucket: b, count, pct: ages.length > 0 ? Math.round((count / ages.length) * 100) : 0 };
  });

  return { average, sampleSize: ages.length, buckets };
}

function birthdaysInMonth(customers: DemographicsCustomer[], parsedMonth: Date) {
  const targetMonth = parsedMonth.getMonth() + 1;
  return customers
    .filter((c) => c.dob)
    .map((c) => {
      const [, monthStr, dayStr] = c.dob!.split("-");
      return { id: c.id, name: c.name, month: Number(monthStr), day: Number(dayStr) };
    })
    .filter((c) => c.month === targetMonth)
    .sort((a, b) => a.day - b.day);
}

// A "Health Ambassador" is a customer who has personally referred 2+
// first-generation customers who went on to become real 20-Day/30-Day
// members (identified by having their own member ID) — walk-ins, trials,
// and plug-in referrals don't count toward this.
function healthAmbassadors(customers: DemographicsCustomer[]) {
  const nameById = new Map(customers.map((c) => [c.id, c.name]));
  const counts = new Map<string, number>();
  for (const c of customers) {
    const qualifies =
      c.invited_by_type === "customer" &&
      c.invited_by_customer_id &&
      (c.nc_level === "20-day" || c.nc_level === "30-day") &&
      c.member_id;
    if (qualifies) {
      const inviterId = c.invited_by_customer_id!;
      counts.set(inviterId, (counts.get(inviterId) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .filter(([, count]) => count >= 2)
    .map(([inviterId, count]) => ({
      inviterId,
      inviterName: nameById.get(inviterId) ?? "—",
      count,
    }))
    .sort((a, b) => b.count - a.count);
}

function DemographicsTab({
  customers,
  parsedMonth,
}: {
  customers: DemographicsCustomer[];
  parsedMonth: Date;
}) {
  const [ageExpanded, setAgeExpanded] = useState(false);
  const genderRows = useMemo(() => genderBreakdown(customers), [customers]);
  const age = useMemo(() => ageStats(customers), [customers]);
  const birthdays = useMemo(() => birthdaysInMonth(customers, parsedMonth), [customers, parsedMonth]);
  const ambassadors = useMemo(() => healthAmbassadors(customers), [customers]);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardDescription>Gender</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {genderRows.map((g) => (
              <div key={g.gender}>
                <div className="flex items-center justify-between text-sm">
                  <span>{g.gender}</span>
                  <span className="font-medium">
                    {g.pct}% <span className="text-muted-foreground">({g.count})</span>
                  </span>
                </div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${g.pct}%` }} />
                </div>
              </div>
            ))}
            {genderRows.length === 0 && (
              <p className="text-sm text-muted-foreground">No customers yet.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader
            className="cursor-pointer select-none"
            onClick={() => setAgeExpanded((v) => !v)}
          >
            <CardDescription className="flex items-center gap-1">
              Average age
              {age.sampleSize > 0 &&
                (ageExpanded ? (
                  <ChevronDown className="size-3.5" />
                ) : (
                  <ChevronRight className="size-3.5" />
                ))}
            </CardDescription>
            <CardTitle className="text-3xl">{age.average ?? "—"}</CardTitle>
          </CardHeader>
          {ageExpanded && age.sampleSize > 0 && (
            <CardContent className="space-y-2.5">
              {age.buckets.map((b) => (
                <div key={b.bucket}>
                  <div className="flex items-center justify-between text-sm">
                    <span>{b.bucket}</span>
                    <span className="font-medium">
                      {b.pct}% <span className="text-muted-foreground">({b.count})</span>
                    </span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-secondary" style={{ width: `${b.pct}%` }} />
                  </div>
                </div>
              ))}
            </CardContent>
          )}
        </Card>
      </div>

      <div>
        <h2 className="text-lg font-semibold">Birthdays in {format(parsedMonth, "MMMM")}</h2>
        <div className="mt-2 overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Customer</TableHead>
                <TableHead className="text-right">Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {birthdays.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>{c.name}</TableCell>
                  <TableCell className="text-right">
                    {format(new Date(2000, c.month - 1, c.day), "d MMM")}
                  </TableCell>
                </TableRow>
              ))}
              {birthdays.length === 0 && (
                <TableRow>
                  <TableCell colSpan={2} className="text-center text-muted-foreground">
                    No birthdays this month.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <div>
        <h2 className="text-lg font-semibold">Health Ambassadors</h2>
        <p className="text-sm text-muted-foreground">
          Customers who&apos;ve personally referred 2 or more first-generation 20-Day/30-Day members.
        </p>
        <div className="mt-2 overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Customer</TableHead>
                <TableHead className="text-right">1st-gen members referred</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ambassadors.map((a) => (
                <TableRow key={a.inviterId}>
                  <TableCell>{a.inviterName}</TableCell>
                  <TableCell className="text-right">{a.count}</TableCell>
                </TableRow>
              ))}
              {ambassadors.length === 0 && (
                <TableRow>
                  <TableCell colSpan={2} className="text-center text-muted-foreground">
                    No Health Ambassadors yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
