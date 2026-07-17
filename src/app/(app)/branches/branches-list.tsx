"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { BranchCoachCupsCompareRow, BranchDailySummaryRow } from "@/lib/types/database";

type DiffColor = "green" | "yellow" | "red";

interface DiffInfo {
  text: string;
  color: DiffColor;
}

const DIFF_COLOR_CLASS: Record<DiffColor, string> = {
  green: "text-primary",
  yellow: "text-amber-600 dark:text-amber-400",
  red: "text-destructive",
};

function diffInfo(current: number, previous: number, decimals = 0): DiffInfo {
  const diff = current - previous;
  if (diff === 0) return { text: "No change", color: "yellow" };
  if (previous === 0) return { text: `+${diff.toFixed(decimals)} (new)`, color: "green" };
  const pct = (diff / previous) * 100;
  const sign = diff > 0 ? "+" : "";
  return {
    text: `${sign}${diff.toFixed(decimals)} (${sign}${pct.toFixed(0)}%)`,
    color: diff > 0 ? "green" : "red",
  };
}

function Stat({
  label,
  value,
  previous,
  decimals = 0,
}: {
  label: string;
  value: number;
  previous: number;
  decimals?: number;
}) {
  const diff = diffInfo(Number(value), Number(previous), decimals);
  return (
    <div className="rounded-md border px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold">{Number(value).toFixed(decimals)}</p>
      <p className={cn("text-xs font-medium", DIFF_COLOR_CLASS[diff.color])}>{diff.text}</p>
    </div>
  );
}

export function BranchesList({
  branches,
  coachCups,
  ownClubId,
  date,
  month,
}: {
  branches: BranchDailySummaryRow[];
  coachCups: BranchCoachCupsCompareRow[];
  ownClubId: string | null;
  date: string;
  month: string;
}) {
  const [expandedClubId, setExpandedClubId] = useState<string | null>(null);

  const coachCupsByClub = useMemo(() => {
    const map = new Map<string, BranchCoachCupsCompareRow[]>();
    for (const row of coachCups) {
      if (!map.has(row.club_id)) map.set(row.club_id, []);
      map.get(row.club_id)!.push(row);
    }
    return map;
  }, [coachCups]);

  if (branches.length === 0) {
    return (
      <p className="mt-6 text-sm text-muted-foreground">
        Nothing to show yet — this shows up once your club is registered.
      </p>
    );
  }

  return (
    <div className="mt-6 space-y-3">
      {branches.map((branch) => {
        const isOwn = branch.club_id === ownClubId;
        const isExpanded = expandedClubId === branch.club_id;
        const clubCoachCups = coachCupsByClub.get(branch.club_id) ?? [];

        return (
          <Card key={branch.club_id}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {branch.club_name}
                {isOwn && <Badge>Your club</Badge>}
              </CardTitle>
              <CardDescription>
                {isOwn
                  ? "Your own club"
                  : "Sponsored branch — never merged with your own club"}
                {branch.prev_date && ` · vs ${branch.prev_date}`}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
                <Stat label="Total Cups" value={branch.total_cups} previous={branch.prev_total_cups} />
                <button
                  type="button"
                  className="rounded-md border px-3 py-2 text-left transition-colors hover:bg-accent"
                  onClick={() =>
                    setExpandedClubId((current) => (current === branch.club_id ? null : branch.club_id))
                  }
                >
                  <p className="flex items-center gap-1 text-xs text-muted-foreground">
                    {isExpanded ? (
                      <ChevronDown className="size-3" />
                    ) : (
                      <ChevronRight className="size-3" />
                    )}
                    Coach&apos;s Cup
                  </p>
                  <p className="text-lg font-semibold">{branch.coach_cup_total}</p>
                  <p
                    className={cn(
                      "text-xs font-medium",
                      DIFF_COLOR_CLASS[diffInfo(branch.coach_cup_total, branch.prev_coach_cup_total).color]
                    )}
                  >
                    {diffInfo(branch.coach_cup_total, branch.prev_coach_cup_total).text}
                  </p>
                </button>
                <Stat label="New 5-Day" value={branch.new_5day} previous={branch.prev_new_5day} />
                <Stat label="10-Day" value={branch.total_10day} previous={branch.prev_total_10day} />
                <Stat label="20-Day" value={branch.total_20day} previous={branch.prev_total_20day} />
                <Stat label="30-Day" value={branch.total_30day} previous={branch.prev_total_30day} />
                <Stat
                  label="Consumption VP"
                  value={branch.consumption_vp}
                  previous={branch.prev_consumption_vp}
                  decimals={2}
                />
              </div>

              {isExpanded && (
                <div className="mt-3 rounded-md border">
                  {clubCoachCups.length === 0 ? (
                    <p className="p-3 text-sm text-muted-foreground">
                      No qualifying check-ins for this club.
                    </p>
                  ) : (
                    <ul className="divide-y">
                      {clubCoachCups.map((c) => {
                        const d = diffInfo(c.cups, c.prev_cups);
                        return (
                          <li
                            key={c.coach_id}
                            className="flex items-center justify-between px-3 py-1.5 text-sm"
                          >
                            <span>{c.coach_name}</span>
                            <span className="flex items-center gap-2">
                              <span>
                                {c.cups} cup{c.cups === 1 ? "" : "s"}
                              </span>
                              <span className={cn("text-xs font-medium", DIFF_COLOR_CLASS[d.color])}>
                                {d.text}
                              </span>
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              )}
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
