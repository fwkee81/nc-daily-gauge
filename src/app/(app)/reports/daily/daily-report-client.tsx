"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { addDays, differenceInYears, format, parseISO } from "date-fns";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronDown, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { CONSUMPTION_TYPES } from "@/lib/constants";
import { getMilestoneTier, type MilestoneTier } from "@/lib/cup-milestones";
import type { ConsumptionType } from "@/lib/types/database";
import {
  correctCheckinAction,
  voidCheckinAction,
  getCheckinHistory,
  getCustomerProfile,
  addDailyReportLogAction,
} from "./actions";

interface CoachCupRow {
  coach_id: string;
  coach_name: string;
  cups: number;
}

interface BranchCoachCupRow {
  coach_id: string;
  coach_name: string;
  coach_club_name: string | null;
  cups: number;
}

interface BirthdayRow {
  customer_id: string;
  name: string;
  dob: string;
  days_until: number;
}

export interface CheckinRow {
  id: string;
  customer_id: string;
  cups: number;
  consumption_type: ConsumptionType;
  voided: boolean;
  is_birthday_shake: boolean;
  created_at: string;
  customer: {
    name: string;
    nc_level: string;
    consumption_balance: number;
    coach: { id: string; name: string } | null;
  } | null;
  // Set when a shared family member checked in themselves rather than the
  // account holder — display their name instead, balance is still shared.
  member: { name: string } | null;
}

function checkinDisplayName(c: CheckinRow) {
  return c.member?.name ?? c.customer?.name ?? "—";
}

// Mirrors coach_cup_excluded_customer_ids() in supabase/schema.sql — a
// checkin counts toward a coach's cup if the customer is assigned to that
// coach and isn't in the excluded set (own or an ancestor's member type, any
// generations back, is SP/WT/AWT/TAB).
function coachCheckins(checkins: CheckinRow[], coachId: string, excludedCustomerIds: Set<string>) {
  return checkins.filter(
    (c) =>
      !c.voided && c.customer?.coach?.id === coachId && !excludedCustomerIds.has(c.customer_id)
  );
}

// Shared by the Coach's Cup and Branches Coach's Cup tables — same
// click-to-expand-per-coach interaction, the branch version just adds a
// column for which club the coach is actually registered under.
function CoachCupTable({
  rows,
  checkins,
  excludedCustomerIdSet,
  expandedCoachId,
  setExpandedCoachId,
  emptyMessage,
  showClubColumn = false,
}: {
  rows: { coach_id: string; coach_name: string; cups: number; coach_club_name?: string | null }[];
  checkins: CheckinRow[];
  excludedCustomerIdSet: Set<string>;
  expandedCoachId: string | null;
  setExpandedCoachId: (updater: (current: string | null) => string | null) => void;
  emptyMessage: string;
  showClubColumn?: boolean;
}) {
  const colSpan = showClubColumn ? 3 : 2;
  return (
    <div className="mt-2 overflow-x-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Coach</TableHead>
            {showClubColumn && <TableHead>Their club</TableHead>}
            <TableHead className="text-right">Cups</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => {
            const isExpanded = expandedCoachId === row.coach_id;
            const customerCheckins = isExpanded
              ? coachCheckins(checkins, row.coach_id, excludedCustomerIdSet)
              : [];
            return (
              <Fragment key={row.coach_id}>
                <TableRow
                  className={cn(
                    "cursor-pointer hover:bg-accent/50",
                    isExpanded && "border-l-4 border-l-primary bg-primary/5 hover:bg-primary/10"
                  )}
                  onClick={() =>
                    setExpandedCoachId((current) => (current === row.coach_id ? null : row.coach_id))
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
                      {row.coach_name}
                    </span>
                  </TableCell>
                  {showClubColumn && (
                    <TableCell className="text-muted-foreground">
                      {row.coach_club_name ?? "—"}
                    </TableCell>
                  )}
                  <TableCell className="text-right">{row.cups}</TableCell>
                </TableRow>
                {isExpanded && (
                  <TableRow key={`${row.coach_id}-detail`} className="border-l-4 border-l-primary">
                    <TableCell colSpan={colSpan} className="bg-primary/5 p-0">
                      {customerCheckins.length === 0 ? (
                        <p className="p-3 text-sm text-muted-foreground">
                          No qualifying check-ins for this coach.
                        </p>
                      ) : (
                        <ul className="divide-y divide-primary/10">
                          {customerCheckins.map((c) => (
                            <li
                              key={c.id}
                              className="flex items-center justify-between py-1.5 pr-3 pl-8 text-sm"
                            >
                              <span>{checkinDisplayName(c)}</span>
                              <span className="text-muted-foreground">
                                {c.cups} cup{c.cups > 1 ? "s" : ""}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </TableCell>
                  </TableRow>
                )}
              </Fragment>
            );
          })}
          {rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={colSpan} className="text-center text-muted-foreground">
                {emptyMessage}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}

type CheckinSortKey =
  | "customer"
  | "coach"
  | "nc_level"
  | "cups"
  | "consumption_type"
  | "balance"
  | "time"
  | "status";

function checkinSortValue(c: CheckinRow, key: CheckinSortKey): string | number {
  switch (key) {
    case "customer":
      return checkinDisplayName(c);
    case "coach":
      return c.customer?.coach?.name ?? "";
    case "nc_level":
      return c.customer?.nc_level ?? "";
    case "cups":
      return c.cups;
    case "consumption_type":
      return c.consumption_type;
    case "balance":
      return c.customer?.consumption_balance ?? 0;
    case "time":
      return c.created_at;
    case "status":
      return c.voided ? 1 : 0;
  }
}

function SortableHead({
  label,
  active,
  direction,
  onClick,
  className,
}: {
  label: string;
  active: boolean;
  direction: "asc" | "desc";
  onClick: () => void;
  className?: string;
}) {
  return (
    <TableHead
      className={cn("cursor-pointer select-none whitespace-nowrap hover:text-foreground", className)}
      onClick={onClick}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {active ? (
          direction === "asc" ? (
            <ArrowUp className="size-3" />
          ) : (
            <ArrowDown className="size-3" />
          )
        ) : (
          <ArrowUpDown className="size-3 opacity-30" />
        )}
      </span>
    </TableHead>
  );
}

// Combines actual renewals with newly added customers into one list — a
// brand new sign-up is the first entry in a customer's cup ledger, so it
// shows up here too (tagged "New" instead of "Renewal").
export interface LedgerRow {
  id: string;
  kind: "new" | "renewal";
  customerName: string;
  ncLevel: string;
  cupsAdded: number;
  previousBalance: number;
  newBalance: number;
  byCoachName: string | null;
  createdAt: string;
  // Only ever set for a "Custom" renewal — the reason a coach manually
  // entered a cup count outside the fixed NC levels.
  reason: string | null;
}

// One free-text entry in a club's "what happened today" log — not tied to
// any customer or ledger row, shown as its own section right after the
// New/Renewals table.
export interface DailyLogEntry {
  id: string;
  note: string;
  coachName: string | null;
  createdAt: string;
}

interface HistoryEntry {
  id: string;
  field_changed: string;
  old_value: string | null;
  new_value: string | null;
  reason: string | null;
  created_at: string;
  editor: { name: string } | null;
}

const CONFETTI_COLORS = [
  "#9ec835",
  "#ffbd59",
  "#ff6b6b",
  "#4dabf7",
  "#f06595",
  "#9ec835",
  "#ffbd59",
  "#4dabf7",
];

export function DailyReportClient({
  date,
  hasExplicitDate,
  clubId,
  clubName,
  viewingBranch,
  isAdmin,
  totals,
  coachCups,
  branchCoachCups,
  birthdays,
  checkins,
  excludedCustomerIds,
  pluginCustomerIds,
  ledger,
  dailyLogs,
}: {
  date: string;
  hasExplicitDate: boolean;
  clubId: string;
  clubName: string | null;
  viewingBranch: boolean;
  isAdmin: boolean;
  totals: {
    total_cups: number;
    plugin_cups: number;
    coach_cup_total: number;
    dine_in_cups: number;
    takeaway_cups: number;
  };
  coachCups: CoachCupRow[];
  branchCoachCups: BranchCoachCupRow[];
  birthdays: BirthdayRow[];
  checkins: CheckinRow[];
  excludedCustomerIds: string[];
  pluginCustomerIds: string[];
  ledger: LedgerRow[];
  dailyLogs: DailyLogEntry[];
}) {
  const router = useRouter();
  const [checkinSort, setCheckinSort] = useState<{ key: CheckinSortKey; dir: "asc" | "desc" } | null>(
    null
  );
  const [expandedCoachId, setExpandedCoachId] = useState<string | null>(null);
  const [hideVoided, setHideVoided] = useState(false);
  const [breakdownOpen, setBreakdownOpen] = useState<"plugin" | "dine-in" | "takeaway" | null>(null);
  const [celebratingTier, setCelebratingTier] = useState<MilestoneTier | null>(null);
  const excludedCustomerIdSet = useMemo(() => new Set(excludedCustomerIds), [excludedCustomerIds]);
  const pluginCustomerIdSet = useMemo(() => new Set(pluginCustomerIds), [pluginCustomerIds]);
  const currentTier = useMemo(() => getMilestoneTier(totals.total_cups), [totals.total_cups]);

  const breakdowns = useMemo(() => {
    const active = checkins.filter((c) => !c.voided);
    return {
      plugin: {
        title: "Plug-in Cups",
        rows: active.filter((c) => pluginCustomerIdSet.has(c.customer_id)),
      },
      "dine-in": {
        title: "Dine-in Cups",
        rows: active.filter((c) => c.consumption_type === "Dine-in"),
      },
      takeaway: {
        title: "Take-away Cups",
        rows: active.filter((c) => c.consumption_type === "Take-away"),
      },
    } as const;
  }, [checkins, pluginCustomerIdSet]);

  const sortedCheckins = useMemo(() => {
    const filtered = hideVoided ? checkins.filter((c) => !c.voided) : checkins;
    if (!checkinSort) return filtered;
    const { key, dir } = checkinSort;
    const sorted = [...filtered].sort((a, b) => {
      const av = checkinSortValue(a, key);
      const bv = checkinSortValue(b, key);
      if (av < bv) return -1;
      if (av > bv) return 1;
      return 0;
    });
    return dir === "asc" ? sorted : sorted.reverse();
  }, [checkins, checkinSort, hideVoided]);

  function toggleCheckinSort(key: CheckinSortKey) {
    setCheckinSort((current) => {
      if (current?.key === key) {
        return { key, dir: current.dir === "asc" ? "desc" : "asc" };
      }
      return { key, dir: "asc" };
    });
  }

  // The server defaults "today" using its own clock (Vercel runs in UTC),
  // which can be a day off from the club's actual local date for several
  // hours a day. If no date was explicitly requested, self-correct to the
  // browser's local today right after hydration.
  useEffect(() => {
    if (hasExplicitDate) return;
    const clientToday = format(new Date(), "yyyy-MM-dd");
    if (clientToday !== date) {
      const clubQuery = viewingBranch ? `&club=${clubId}` : "";
      router.replace(`/reports/daily?date=${clientToday}${clubQuery}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Pop the confetti for today's live total whenever the cup count reaches a
  // new, higher tier (25/35/50/75/100) — not when just browsing back through
  // a past date, and not again on refresh unless a new tier was reached.
  useEffect(() => {
    if (!currentTier) return;
    if (date !== format(new Date(), "yyyy-MM-dd")) return;

    const key = `nc-cup-milestone-${clubId}-${date}`;
    const lastCelebratedTier = Number(window.localStorage.getItem(key) ?? "0");
    if (currentTier.cups <= lastCelebratedTier) return;
    window.localStorage.setItem(key, String(currentTier.cups));
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCelebratingTier(currentTier);
  }, [clubId, date, currentTier]);

  function goToDate(d: string) {
    const clubQuery = viewingBranch ? `&club=${clubId}` : "";
    router.push(`/reports/daily?date=${d}${clubQuery}`);
  }

  const parsedDate = parseISO(date);

  return (
    <div className="space-y-6">
      {viewingBranch && (
        <div className="flex items-center justify-between rounded-md border bg-secondary/15 px-4 py-2 text-sm">
          <span>
            Viewing branch <strong>{clubName}</strong> — not merged with your own club.
          </span>
          <Link href="/reports/daily" className="underline underline-offset-4">
            Back to my club
          </Link>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">
          Daily Report{clubName ? ` — ${clubName}` : ""} · {format(parsedDate, "EEEE, d MMM yyyy")}
        </h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => goToDate(format(addDays(parsedDate, -1), "yyyy-MM-dd"))}>
            ← Prev day
          </Button>
          <Input
            type="date"
            className="w-auto"
            value={date}
            onChange={(e) => goToDate(e.target.value)}
          />
          <Button variant="outline" size="sm" onClick={() => goToDate(format(addDays(parsedDate, 1), "yyyy-MM-dd"))}>
            Next day →
          </Button>
        </div>
      </div>

      <Card className="border-2 border-primary bg-primary/5 sm:max-w-xs">
        <CardHeader>
          <CardDescription>Total NC Cups</CardDescription>
          <div className="flex items-center gap-2">
            <CardTitle className="text-2xl font-bold text-primary">{totals.total_cups}</CardTitle>
            {currentTier && (
              <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-xs font-medium text-primary">
                <span aria-hidden>{currentTier.emoji}</span>
                {currentTier.title}
              </span>
            )}
          </div>
        </CardHeader>
      </Card>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card
          className="cursor-pointer transition-colors hover:bg-accent/50"
          onClick={() => setBreakdownOpen("plugin")}
        >
          <CardHeader>
            <CardDescription>Plug-in Cups</CardDescription>
            <CardTitle className="text-2xl">{totals.plugin_cups}</CardTitle>
          </CardHeader>
        </Card>
        <Card
          className="cursor-pointer transition-colors hover:bg-accent/50"
          onClick={() => setBreakdownOpen("dine-in")}
        >
          <CardHeader>
            <CardDescription>Dine-in Cups</CardDescription>
            <CardTitle className="text-2xl">{totals.dine_in_cups}</CardTitle>
          </CardHeader>
        </Card>
        <Card
          className="cursor-pointer transition-colors hover:bg-accent/50"
          onClick={() => setBreakdownOpen("takeaway")}
        >
          <CardHeader>
            <CardDescription>Take-away Cups</CardDescription>
            <CardTitle className="text-2xl">{totals.takeaway_cups}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Dialog open={!!breakdownOpen} onOpenChange={(open) => !open && setBreakdownOpen(null)}>
        <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{breakdownOpen ? breakdowns[breakdownOpen].title : ""}</DialogTitle>
          </DialogHeader>
          {breakdownOpen && (
            <ul className="divide-y">
              {breakdowns[breakdownOpen].rows.map((c) => (
                <li key={c.id} className="flex items-center justify-between py-2 text-sm">
                  <span>{checkinDisplayName(c)}</span>
                  <span className="text-muted-foreground">
                    {c.cups} cup{c.cups > 1 ? "s" : ""}
                  </span>
                </li>
              ))}
              {breakdowns[breakdownOpen].rows.length === 0 && (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  No check-ins yet.
                </p>
              )}
            </ul>
          )}
        </DialogContent>
      </Dialog>

      <div>
        <h2 className="text-lg font-semibold">Coach&apos;s Cup</h2>
        <CoachCupTable
          rows={coachCups}
          checkins={checkins}
          excludedCustomerIdSet={excludedCustomerIdSet}
          expandedCoachId={expandedCoachId}
          setExpandedCoachId={setExpandedCoachId}
          emptyMessage="No qualifying check-ins yet."
        />
      </div>

      {branchCoachCups.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold">Branches Coach&apos;s Cup</h2>
          <p className="text-sm text-muted-foreground">
            Coaches registered under a different club, credited here because one of their
            customers checked in at this club.
          </p>
          <CoachCupTable
            rows={branchCoachCups}
            checkins={checkins}
            excludedCustomerIdSet={excludedCustomerIdSet}
            expandedCoachId={expandedCoachId}
            setExpandedCoachId={setExpandedCoachId}
            emptyMessage="No branch coaches yet."
            showClubColumn
          />
        </div>
      )}

      <div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Check-ins on this day</h2>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={hideVoided}
              onChange={(e) => setHideVoided(e.target.checked)}
            />
            Only show active (hide voided)
          </label>
        </div>
        <div className="mt-2 overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <SortableHead
                  label="Customer"
                  active={checkinSort?.key === "customer"}
                  direction={checkinSort?.dir ?? "asc"}
                  onClick={() => toggleCheckinSort("customer")}
                  className="sticky left-0 z-20 border-r bg-background"
                />
                <SortableHead
                  label="Coach"
                  active={checkinSort?.key === "coach"}
                  direction={checkinSort?.dir ?? "asc"}
                  onClick={() => toggleCheckinSort("coach")}
                />
                <SortableHead
                  label="NC Level"
                  active={checkinSort?.key === "nc_level"}
                  direction={checkinSort?.dir ?? "asc"}
                  onClick={() => toggleCheckinSort("nc_level")}
                />
                <SortableHead
                  label="Cups"
                  active={checkinSort?.key === "cups"}
                  direction={checkinSort?.dir ?? "asc"}
                  onClick={() => toggleCheckinSort("cups")}
                />
                <SortableHead
                  label="Type"
                  active={checkinSort?.key === "consumption_type"}
                  direction={checkinSort?.dir ?? "asc"}
                  onClick={() => toggleCheckinSort("consumption_type")}
                />
                <SortableHead
                  label="Consumption left"
                  active={checkinSort?.key === "balance"}
                  direction={checkinSort?.dir ?? "asc"}
                  onClick={() => toggleCheckinSort("balance")}
                />
                <SortableHead
                  label="Time"
                  active={checkinSort?.key === "time"}
                  direction={checkinSort?.dir ?? "asc"}
                  onClick={() => toggleCheckinSort("time")}
                />
                <SortableHead
                  label="Status"
                  active={checkinSort?.key === "status"}
                  direction={checkinSort?.dir ?? "asc"}
                  onClick={() => toggleCheckinSort("status")}
                />
                {isAdmin && <TableHead />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedCheckins.map((c) => (
                <TableRow key={c.id} className={c.voided ? "opacity-50" : undefined}>
                  <TableCell className="sticky left-0 z-10 border-r bg-background">
                    <div className="flex items-center gap-1.5">
                      <CustomerInfoDialog customerId={c.customer_id} name={checkinDisplayName(c)} />
                      {c.is_birthday_shake && <span title="Birthday Shake (free)">🎂</span>}
                    </div>
                  </TableCell>
                  <TableCell>{c.customer?.coach?.name ?? "—"}</TableCell>
                  <TableCell>{c.customer?.nc_level ?? "—"}</TableCell>
                  <TableCell>{c.cups}</TableCell>
                  <TableCell>{c.consumption_type}</TableCell>
                  <TableCell>{c.customer?.consumption_balance ?? "—"}</TableCell>
                  <TableCell>{format(new Date(c.created_at), "p")}</TableCell>
                  <TableCell>{c.voided ? <Badge variant="destructive">Voided</Badge> : <Badge variant="secondary">Active</Badge>}</TableCell>
                  {isAdmin && (
                    <TableCell>
                      <ManageCheckinDialog checkin={c} />
                    </TableCell>
                  )}
                </TableRow>
              ))}
              {sortedCheckins.length === 0 && (
                <TableRow>
                  <TableCell colSpan={isAdmin ? 9 : 8} className="text-center text-muted-foreground">
                    {checkins.length === 0
                      ? "No check-ins on this day."
                      : "No active check-ins on this day (all voided)."}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <div>
        <h2 className="text-lg font-semibold">New/Renewals</h2>
        <div className="mt-2 overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Type</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>NC Level</TableHead>
                <TableHead>Cups added</TableHead>
                <TableHead>Balance</TableHead>
                <TableHead>By Coach</TableHead>
                <TableHead>Time</TableHead>
                <TableHead>Reason</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ledger.map((r) => (
                <TableRow key={`${r.kind}-${r.id}`}>
                  <TableCell>
                    {r.kind === "new" ? (
                      <Badge>New</Badge>
                    ) : (
                      <Badge variant="secondary">Renewal</Badge>
                    )}
                  </TableCell>
                  <TableCell>{r.customerName}</TableCell>
                  <TableCell>{r.ncLevel}</TableCell>
                  <TableCell>+{r.cupsAdded}</TableCell>
                  <TableCell>
                    {r.previousBalance} → {r.newBalance}
                  </TableCell>
                  <TableCell>{r.byCoachName ?? "—"}</TableCell>
                  <TableCell>{format(new Date(r.createdAt), "p")}</TableCell>
                  <TableCell className="max-w-56 whitespace-pre-wrap">{r.reason ?? "—"}</TableCell>
                </TableRow>
              ))}
              {ledger.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground">
                    No new customers or renewals on this day.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <div>
        <h2 className="text-lg font-semibold">Remark / Post Meeting</h2>
        <p className="mt-1 text-sm text-muted-foreground">What happened today.</p>
        <DailyLogSection clubId={clubId} date={date} logs={dailyLogs} />
      </div>

      <div>
        <h2 className="text-lg font-semibold">Upcoming birthdays (next 3 days)</h2>
        <div className="mt-2 space-y-1">
          {birthdays.length === 0 && (
            <p className="text-sm text-muted-foreground">No birthdays in the next 3 days.</p>
          )}
          {birthdays.map((b) => (
            <div key={b.customer_id} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
              <span>{b.name}</span>
              <span className="text-muted-foreground">
                {format(parseISO(b.dob), "d MMM")} · {b.days_until === 0 ? "today" : `in ${b.days_until}d`}
              </span>
            </div>
          ))}
        </div>
      </div>

      <Dialog open={!!celebratingTier} onOpenChange={(open) => !open && setCelebratingTier(null)}>
        <DialogContent className="overflow-hidden sm:max-w-sm">
          {CONFETTI_COLORS.map((color, i) => (
            <span
              key={i}
              aria-hidden
              className="pointer-events-none absolute top-0 h-2.5 w-2.5 rounded-sm"
              style={{
                left: `${(i * 13 + 5) % 100}%`,
                backgroundColor: color,
                animation: "confetti-fall 1.8s ease-in forwards",
                animationDelay: `${(i % 6) * 0.15}s`,
              }}
            />
          ))}
          <DialogHeader>
            <DialogTitle className="text-center text-2xl">
              {celebratingTier?.emoji} {celebratingTier?.title} {celebratingTier?.emoji}
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col items-center gap-2 py-2 text-center">
            <span
              className="text-6xl"
              style={{ display: "inline-block", animation: "cake-bounce 1s ease-in-out infinite" }}
            >
              {celebratingTier?.emoji}
            </span>
            <p className="text-xl font-semibold">{totals.total_cups} cups today</p>
            <p className="text-base text-muted-foreground">{celebratingTier?.message}</p>
          </div>
          <Button className="w-full py-6 text-lg" onClick={() => setCelebratingTier(null)}>
            OK
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DailyLogSection({
  clubId,
  date,
  logs,
}: {
  clubId: string;
  date: string;
  logs: DailyLogEntry[];
}) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleAdd() {
    if (!note.trim()) {
      toast.error("Please enter a note.");
      return;
    }
    setSaving(true);
    const res = await addDailyReportLogAction(clubId, date, note);
    setSaving(false);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    setNote("");
    toast.success("Note added.");
    router.refresh();
  }

  return (
    <div className="mt-2 space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row">
        <Textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="What happened today..."
          rows={2}
          className="flex-1"
        />
        <Button onClick={handleAdd} disabled={saving} className="sm:self-end">
          {saving ? "Adding..." : "Add"}
        </Button>
      </div>

      {logs.length === 0 ? (
        <p className="text-sm text-muted-foreground">No notes yet today.</p>
      ) : (
        <ul className="space-y-2">
          {logs.map((l) => (
            <li key={l.id} className="rounded-md border px-3 py-2 text-sm">
              <p className="whitespace-pre-wrap">{l.note}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {l.coachName ?? "—"} · {format(new Date(l.createdAt), "p")}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ManageCheckinDialog({ checkin }: { checkin: CheckinRow }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [cups, setCups] = useState(checkin.cups);
  const [type, setType] = useState<ConsumptionType>(checkin.consumption_type);
  const [isBirthdayShake, setIsBirthdayShake] = useState(checkin.is_birthday_shake);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[] | null>(null);

  useEffect(() => {
    if (open) {
      getCheckinHistory(checkin.id).then((res) => {
        if ("data" in res) setHistory(res.data as unknown as HistoryEntry[]);
      });
    }
  }, [open, checkin.id]);

  async function handleSave() {
    if (!reason.trim()) {
      toast.error("Please enter a reason for this correction.");
      return;
    }
    setSaving(true);
    const res = await correctCheckinAction(checkin.id, cups, type, reason.trim(), isBirthdayShake);
    setSaving(false);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    toast.success("Check-in corrected.");
    setReason("");
    setOpen(false);
    router.refresh();
  }

  async function handleVoid() {
    if (!reason.trim()) {
      toast.error("Please enter a reason for voiding this check-in.");
      return;
    }
    setSaving(true);
    const res = await voidCheckinAction(checkin.id, reason.trim());
    setSaving(false);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    toast.success("Check-in voided.");
    setReason("");
    setOpen(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" variant="outline" disabled={checkin.voided} />}>
        Manage
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Manage check-in — {checkinDisplayName(checkin)}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Cups</Label>
              <Select value={String(cups)} onValueChange={(v) => setCups(Number(v))}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1</SelectItem>
                  <SelectItem value="2">2</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Consumption type</Label>
              <Select value={type} onValueChange={(v) => setType(v as ConsumptionType)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CONSUMPTION_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id={`birthday-shake-${checkin.id}`}
              checked={isBirthdayShake}
              onCheckedChange={(checked) => setIsBirthdayShake(checked)}
            />
            <Label htmlFor={`birthday-shake-${checkin.id}`} className="font-normal">
              🎂 Birthday Shake (free, balance not deducted)
            </Label>
          </div>

          <div className="space-y-1">
            <Label>Reason for change *</Label>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. miscounted cups" />
          </div>

          <div className="flex gap-2">
            <Button className="flex-1" onClick={handleSave} disabled={saving}>
              Save correction
            </Button>
            <Button className="flex-1" variant="destructive" onClick={handleVoid} disabled={saving}>
              Void check-in
            </Button>
          </div>

          <Separator />

          <div>
            <h3 className="text-sm font-semibold">Edit history</h3>
            {history === null && <p className="text-xs text-muted-foreground">Loading...</p>}
            {history?.length === 0 && (
              <p className="text-xs text-muted-foreground">No corrections have been made.</p>
            )}
            <ul className="mt-1 space-y-1">
              {history?.map((h) => (
                <li key={h.id} className="text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">{h.editor?.name ?? "Unknown"}</span>{" "}
                  changed {h.field_changed} from &quot;{h.old_value}&quot; to &quot;{h.new_value}&quot;
                  {h.reason ? ` — ${h.reason}` : ""} ({format(new Date(h.created_at), "d MMM p")})
                </li>
              ))}
            </ul>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface CustomerProfile {
  id: string;
  name: string;
  gender: string;
  contact: string;
  dob: string | null;
  age_override: number | null;
  nc_level: string;
  consumption_balance: number;
  invited_by_type: string;
  member_id: string | null;
  member_type: string | null;
  remark: string | null;
  is_pjs: boolean;
  is_health_ambassador: boolean;
  active: boolean;
  coach: { name: string } | null;
  invited_by_coach: { name: string } | null;
  invitedByCustomerName: string | null;
  members: { id: string; name: string; contact: string | null; dob: string | null }[];
}

function CustomerInfoDialog({ customerId, name }: { customerId: string; name: string }) {
  const [open, setOpen] = useState(false);
  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || profile || error) return;
    getCustomerProfile(customerId).then((res) => {
      if ("data" in res) setProfile(res.data as unknown as CustomerProfile);
      else setError(res.error ?? "Could not load customer.");
    });
  }, [open, customerId, profile, error]);

  function invitedByLabel(p: CustomerProfile) {
    if (p.invited_by_type === "plugin") return "Plug-in";
    if (p.invited_by_type === "coach") return p.invited_by_coach?.name ?? "—";
    return p.invitedByCustomerName ?? "—";
  }

  function ageOf(p: CustomerProfile) {
    if (p.age_override != null) return p.age_override;
    if (!p.dob) return null;
    return differenceInYears(new Date(), new Date(p.dob));
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="link" className="h-auto p-0" />}>{name}</DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{name}</DialogTitle>
        </DialogHeader>

        {error && <p className="text-sm text-destructive">{error}</p>}
        {!error && !profile && <p className="text-sm text-muted-foreground">Loading...</p>}

        {profile && (
          <div className="space-y-2 text-sm">
            <div className="grid grid-cols-2 gap-x-4 gap-y-2">
              <div>
                <p className="text-xs text-muted-foreground">Gender</p>
                <p>{profile.gender}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Contact</p>
                <p>{profile.contact}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Age</p>
                <p>{ageOf(profile) ?? "—"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">NC Level</p>
                <p>{profile.nc_level}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Consumption balance</p>
                <p>{profile.consumption_balance}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Invited by</p>
                <p>{invitedByLabel(profile)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Coach</p>
                <p>{profile.coach?.name ?? "—"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Member</p>
                <p>
                  {profile.member_id ? `${profile.member_id} (${profile.member_type ?? "—"})` : "—"}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Status</p>
                <p>{profile.active ? "Active" : "Inactive"}</p>
              </div>
            </div>

            {(profile.is_pjs || profile.is_health_ambassador) && (
              <div className="flex gap-1.5">
                {profile.is_pjs && <Badge variant="outline">PJS</Badge>}
                {profile.is_health_ambassador && <Badge variant="outline">Health Ambassador</Badge>}
              </div>
            )}

            <div>
              <p className="text-xs text-muted-foreground">Remark</p>
              <p>{profile.remark || "—"}</p>
            </div>

            {profile.members.length > 0 && (
              <div>
                <p className="text-xs text-muted-foreground">Shares account with</p>
                <ul className="mt-1 space-y-0.5">
                  {profile.members.map((m) => (
                    <li key={m.id}>
                      {m.name}
                      {m.contact && <span className="text-muted-foreground"> · {m.contact}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <Separator />

            <Link
              href={`/wellness-report/${customerId}`}
              className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm transition-colors hover:bg-accent"
            >
              Wellness Report <ChevronRight className="size-4 text-muted-foreground" />
            </Link>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
