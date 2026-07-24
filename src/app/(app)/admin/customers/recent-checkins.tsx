"use client";

import { useEffect, useState } from "react";
import { eachDayOfInterval, format, parseISO, subDays } from "date-fns";
import { createClient } from "@/lib/supabase/client";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { ConsumptionType } from "@/lib/types/database";

interface CheckinEntry {
  checkin_date: string;
  consumption_type: ConsumptionType;
  cups: number;
  is_birthday_shake: boolean;
}

// Quick "has this person been coming?" visual for a coach glancing at a
// customer's profile — a 30-day activity strip (like a mini contribution
// graph) plus the underlying visit list. Fetched on demand when the popup
// opens rather than preloaded for the whole customer list, so the Customers
// table itself stays fast.
export function RecentCheckins({ customerId }: { customerId: string }) {
  const [checkins, setCheckins] = useState<CheckinEntry[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    const since = format(subDays(new Date(), 29), "yyyy-MM-dd");
    supabase
      .from("checkins")
      .select("checkin_date, consumption_type, cups, is_birthday_shake")
      .eq("customer_id", customerId)
      .eq("voided", false)
      .gte("checkin_date", since)
      .order("checkin_date", { ascending: false })
      .then(({ data }) => {
        if (!cancelled) setCheckins(data ?? []);
      });
    return () => {
      cancelled = true;
    };
  }, [customerId]);

  const days = eachDayOfInterval({ start: subDays(new Date(), 29), end: new Date() });

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <p className="text-xs text-muted-foreground">Visit trend (last 30 days)</p>
        {checkins && (
          <p className="text-xs text-muted-foreground">
            {checkins.length} visit{checkins.length === 1 ? "" : "s"}
            {checkins.length > 0 && (
              <> · last {format(parseISO(checkins[0].checkin_date), "d MMM")}</>
            )}
          </p>
        )}
      </div>

      {checkins === null ? (
        <div className="h-5 animate-pulse rounded-md bg-muted" />
      ) : (
        <>
          <div className="flex gap-[3px]">
            {days.map((day) => {
              const key = format(day, "yyyy-MM-dd");
              const visited = checkins.some((c) => c.checkin_date === key);
              return (
                <div
                  key={key}
                  title={`${format(day, "EEE, d MMM")}${visited ? " — visited" : ""}`}
                  className={cn(
                    "h-5 flex-1 rounded-[3px] transition-colors",
                    visited ? "bg-primary" : "bg-muted"
                  )}
                />
              );
            })}
          </div>

          {checkins.length > 0 ? (
            <ul className="max-h-36 space-y-1 overflow-y-auto pr-1">
              {checkins.map((c, i) => (
                <li
                  key={`${c.checkin_date}-${i}`}
                  className="flex items-center justify-between rounded-md border-l-2 border-primary bg-muted/40 px-2 py-1 text-xs"
                >
                  <span>{format(parseISO(c.checkin_date), "EEE, d MMM")}</span>
                  <span className="flex items-center gap-1.5">
                    {c.is_birthday_shake && <span title="Birthday shake">🎂</span>}
                    <Badge variant="secondary">{c.consumption_type}</Badge>
                    <span className="text-muted-foreground">
                      {c.cups} cup{c.cups > 1 ? "s" : ""}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-1 text-xs text-muted-foreground">No visits in the last 30 days.</p>
          )}
        </>
      )}
    </div>
  );
}
