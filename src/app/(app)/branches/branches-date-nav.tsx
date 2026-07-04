"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { addDays, format, parseISO } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { withParam } from "./url";

export function BranchesDateNav({
  date,
  hasExplicitDate,
}: {
  date: string;
  hasExplicitDate: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const parsedDate = parseISO(date);

  // Same "server thinks it's UTC" self-correct as Daily Report/NC Metrics —
  // jump to the browser's local today if no date was explicitly requested.
  useEffect(() => {
    if (hasExplicitDate) return;
    const clientDate = format(new Date(), "yyyy-MM-dd");
    if (clientDate !== date) {
      router.replace(`/branches?${withParam(searchParams, "date", clientDate)}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function goToDate(d: string) {
    router.push(`/branches?${withParam(searchParams, "date", d)}`);
  }

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="outline"
        size="sm"
        onClick={() => goToDate(format(addDays(parsedDate, -1), "yyyy-MM-dd"))}
      >
        ← Prev day
      </Button>
      <Input type="date" className="w-auto" value={date} onChange={(e) => goToDate(e.target.value)} />
      <Button
        variant="outline"
        size="sm"
        onClick={() => goToDate(format(addDays(parsedDate, 1), "yyyy-MM-dd"))}
      >
        Next day →
      </Button>
    </div>
  );
}
