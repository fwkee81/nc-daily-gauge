"use client";

import { useEffect, useState } from "react";
import { format, parseISO } from "date-fns";
import { createClient } from "@/lib/supabase/client";

interface WellnessLogSummary {
  id: string;
  log_date: string;
  weight_kg: number | null;
  body_fat_pct: number | null;
}

// The last 5 My Wellness (Tanita) readings for a customer, shown inline in
// the profile popup so a coach doesn't have to leave it just to see recent
// numbers — the full history is one tap away via the Wellness Report link
// below this. wellness_logs is owned by the separate My Wellness app (see
// the comment on WellnessLog in database.ts) but readable here the same way
// the full Wellness Report page reads it.
export function RecentWellnessLogs({ customerId }: { customerId: string }) {
  const [logs, setLogs] = useState<WellnessLogSummary[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    supabase
      .from("wellness_logs")
      .select("id, log_date, weight_kg, body_fat_pct")
      .eq("customer_id", customerId)
      .order("log_date", { ascending: false })
      .limit(5)
      .then(({ data }) => {
        if (!cancelled) setLogs((data ?? []) as unknown as WellnessLogSummary[]);
      });
    return () => {
      cancelled = true;
    };
  }, [customerId]);

  if (logs === null) {
    return <div className="h-20 animate-pulse rounded-md bg-muted" />;
  }

  if (logs.length === 0) {
    return <p className="text-xs text-muted-foreground">No wellness readings logged yet.</p>;
  }

  return (
    <ul className="space-y-1">
      {logs.map((l) => (
        <li
          key={l.id}
          className="flex items-center justify-between rounded-md border-l-2 border-primary bg-muted/40 px-2 py-1 text-xs"
        >
          <span>{format(parseISO(l.log_date), "d MMM yyyy")}</span>
          <span className="flex items-center gap-3 text-muted-foreground">
            <span>{l.weight_kg != null ? `${l.weight_kg} kg` : "—"}</span>
            <span>{l.body_fat_pct != null ? `${l.body_fat_pct}% fat` : "—"}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
