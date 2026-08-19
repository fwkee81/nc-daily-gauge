"use client";

import { useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { ChevronDown, ChevronRight, Trophy } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { BranchClubCupRecordRow, BranchCoachCupRecordRow } from "@/lib/types/database";

export function BranchesRecords({
  cupRecords,
  coachCupRecords,
  ownClubId,
}: {
  cupRecords: BranchClubCupRecordRow[];
  coachCupRecords: BranchCoachCupRecordRow[];
  ownClubId: string | null;
}) {
  const [expandedClubId, setExpandedClubId] = useState<string | null>(null);

  const coachRecordsByClub = useMemo(() => {
    const map = new Map<string, BranchCoachCupRecordRow[]>();
    for (const row of coachCupRecords) {
      if (!map.has(row.club_id)) map.set(row.club_id, []);
      map.get(row.club_id)!.push(row);
    }
    return map;
  }, [coachCupRecords]);

  if (cupRecords.length === 0) {
    return (
      <p className="mt-6 text-sm text-muted-foreground">
        Nothing to show yet — this shows up once your club is registered.
      </p>
    );
  }

  return (
    <div className="mt-6 space-y-3">
      {cupRecords.map((record) => {
        const isOwn = record.club_id === ownClubId;
        const isExpanded = expandedClubId === record.club_id;
        const clubCoachRecords = coachRecordsByClub.get(record.club_id) ?? [];

        return (
          <Card key={record.club_id}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {record.club_name}
                {isOwn && <Badge>Your club</Badge>}
              </CardTitle>
              <CardDescription>
                {isOwn ? "Your own club" : "Sponsored branch — never merged with your own club"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border px-3 py-2">
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Trophy className="size-3.5 text-amber-500" />
                  Club record — best single day ever
                </p>
                {record.total_cups != null ? (
                  <p className="text-lg font-semibold">
                    {record.total_cups} cups
                    <span className="ml-2 text-sm font-normal text-muted-foreground">
                      {format(parseISO(record.record_date!), "d MMM yyyy")}
                    </span>
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground">No check-ins yet.</p>
                )}
              </div>

              {clubCoachRecords.length > 0 && (
                <button
                  type="button"
                  className="mt-3 flex items-center gap-1 text-sm text-muted-foreground underline underline-offset-4"
                  onClick={() =>
                    setExpandedClubId((current) => (current === record.club_id ? null : record.club_id))
                  }
                >
                  {isExpanded ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
                  {isExpanded ? "Hide" : "Show"} each coach&apos;s personal record
                </button>
              )}

              {isExpanded && (
                <ul className="mt-2 space-y-1.5">
                  {clubCoachRecords.map((c) => (
                    <li
                      key={c.coach_id}
                      className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
                    >
                      <span>{c.coach_name}</span>
                      <span className="flex items-center gap-2">
                        <span className="font-semibold">{c.cups} cups</span>
                        <span className="text-xs text-muted-foreground">
                          {format(parseISO(c.record_date), "d MMM yyyy")}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
