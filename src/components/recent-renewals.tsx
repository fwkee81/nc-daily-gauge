"use client";

import { useEffect, useState } from "react";
import { format, parseISO } from "date-fns";
import { createClient } from "@/lib/supabase/client";
import { Badge } from "@/components/ui/badge";
import type { CustomerNcLevel } from "@/lib/types/database";

interface RenewalEntry {
  id: string;
  created_at: string;
  nc_level: CustomerNcLevel;
  cups_added: number;
  reason: string | null;
}

const NC_LEVEL_LABEL: Record<string, string> = {
  "5-day": "5-Day",
  "10-day": "10-Day",
  "20-day": "20-Day",
  "30-day": "30-Day",
};

// Full renewal history for a coach glancing at a customer's profile — when
// did they last top up, and to which level — without having to dig through
// the Daily Report's day-by-day New/Renewals ledger.
export function RecentRenewals({ customerId }: { customerId: string }) {
  const [renewals, setRenewals] = useState<RenewalEntry[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    supabase
      .from("customer_renewals")
      .select("id, created_at, nc_level, cups_added, reason")
      .eq("customer_id", customerId)
      .order("created_at", { ascending: false })
      .limit(20)
      .then(({ data }) => {
        if (!cancelled) setRenewals((data ?? []) as unknown as RenewalEntry[]);
      });
    return () => {
      cancelled = true;
    };
  }, [customerId]);

  if (renewals === null) {
    return <div className="h-20 animate-pulse rounded-md bg-muted" />;
  }

  if (renewals.length === 0) {
    return <p className="text-xs text-muted-foreground">No renewals yet.</p>;
  }

  return (
    <ul className="max-h-48 space-y-1 overflow-y-auto pr-1">
      {renewals.map((r) => (
        <li
          key={r.id}
          className="flex items-center justify-between rounded-md border-l-2 border-primary bg-muted/40 px-2 py-1 text-xs"
        >
          <span>{format(parseISO(r.created_at), "d MMM yyyy")}</span>
          <span className="flex items-center gap-1.5">
            {r.reason && <span className="text-muted-foreground" title={r.reason}>{r.reason}</span>}
            <Badge variant="secondary">{NC_LEVEL_LABEL[r.nc_level] ?? r.nc_level}</Badge>
            <span className="text-muted-foreground">+{r.cups_added} cups</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
