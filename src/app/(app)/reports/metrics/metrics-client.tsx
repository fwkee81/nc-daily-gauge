"use client";

import { useRouter } from "next/navigation";
import { addMonths, format, parse } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface CoachCupRow {
  coach_id: string;
  coach_name: string;
  total_cups: number;
  avg_daily_cups: number;
}

export function MetricsClient({
  month,
  totals,
  coachCups,
}: {
  month: string;
  totals: { total_cups: number; days_in_period: number; avg_daily_cups: number };
  coachCups: CoachCupRow[];
}) {
  const router = useRouter();
  const parsedMonth = parse(month, "yyyy-MM", new Date());

  function goToMonth(m: string) {
    router.push(`/reports/metrics?month=${m}`);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">NC Metrics — {format(parsedMonth, "MMMM yyyy")}</h1>
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
            <CardDescription>Average NC Cups / day ({totals.days_in_period} days)</CardDescription>
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
                <TableHead className="text-right">Avg / day</TableHead>
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
    </div>
  );
}
