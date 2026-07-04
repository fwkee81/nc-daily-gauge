"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { addMonths, format, parse } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { withParam } from "./url";

export function BranchesMonthNav({
  month,
  hasExplicitMonth,
}: {
  month: string;
  hasExplicitMonth: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const parsedMonth = parse(month, "yyyy-MM", new Date());

  // Same "server thinks it's UTC" self-correct as NC Metrics.
  useEffect(() => {
    if (hasExplicitMonth) return;
    const clientMonth = format(new Date(), "yyyy-MM");
    if (clientMonth !== month) {
      router.replace(`/branches?${withParam(searchParams, "month", clientMonth)}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function goToMonth(m: string) {
    router.push(`/branches?${withParam(searchParams, "month", m)}`);
  }

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="outline"
        size="sm"
        onClick={() => goToMonth(format(addMonths(parsedMonth, -1), "yyyy-MM"))}
      >
        ← Prev month
      </Button>
      <Input
        type="month"
        className="w-auto"
        value={month}
        onChange={(e) => goToMonth(e.target.value)}
      />
      <Button
        variant="outline"
        size="sm"
        onClick={() => goToMonth(format(addMonths(parsedMonth, 1), "yyyy-MM"))}
      >
        Next month →
      </Button>
    </div>
  );
}
