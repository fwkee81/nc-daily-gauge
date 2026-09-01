"use client";

import { useEffect } from "react";
import { format, parse } from "date-fns";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import type {
  MonthlyCoachCupsByDayRow,
  MonthlyCupRecordsRow,
  MonthlyDailyBreakdownRow,
  MonthlyInventoryOutRow,
  MonthlyInventoryReportRow,
  MonthlyPackageSaleRow,
} from "@/lib/types/database";
import type { FinanceMonthlySummary } from "@/app/(app)/finance/finance-client";

interface Birthday {
  id: string;
  name: string;
  day: number;
}

const PACKAGE_LEVELS = ["5-day", "10-day", "20-day", "30-day"] as const;
const PACKAGE_LABELS: Record<(typeof PACKAGE_LEVELS)[number], string> = {
  "5-day": "5-Day",
  "10-day": "10-Day",
  "20-day": "20-Day",
  "30-day": "30-Day",
};

function fmtDate(iso: string | null, pattern = "d MMM yyyy") {
  if (!iso) return "—";
  return format(parse(iso, "yyyy-MM-dd", new Date()), pattern);
}

function PageHeader({
  title,
  clubName,
  monthLabel,
  meta,
}: {
  title: string;
  clubName: string;
  monthLabel: string;
  meta?: string;
}) {
  return (
    <div className="mb-6 flex items-end justify-between border-b-2 border-foreground pb-3">
      <div>
        <h2 className="text-xl font-semibold">{title}</h2>
        <p className="text-xs text-muted-foreground">NC Daily Gauge — {clubName}</p>
      </div>
      <div className="text-right text-xs text-muted-foreground">
        <p>{monthLabel}</p>
        {meta && <p>{meta}</p>}
      </div>
    </div>
  );
}

function ReportPage({
  children,
  isLast = false,
  footer,
}: {
  children: React.ReactNode;
  isLast?: boolean;
  footer: string;
}) {
  return (
    <section
      className="report-page mx-auto mb-8 w-full max-w-[794px] bg-background p-10 shadow-sm print:mb-0 print:max-w-none print:shadow-none"
      style={{ pageBreakAfter: isLast ? "auto" : "always" }}
    >
      {children}
      <div className="mt-6 flex justify-between border-t pt-2 text-[10px] text-muted-foreground">
        <span>NC Daily Gauge</span>
        <span>{footer}</span>
      </div>
    </section>
  );
}

export function MonthlyReportClient({
  clubName,
  month,
  totals,
  packageSales,
  inventoryOut,
  dailyBreakdown,
  coachCupsByDay,
  records,
  inventoryReport,
  birthdays,
  isOwner,
  financeSummary,
}: {
  clubName: string;
  month: string;
  totals: { total_cups: number; days_in_period: number; avg_daily_cups: number };
  packageSales: MonthlyPackageSaleRow[];
  inventoryOut: MonthlyInventoryOutRow[];
  dailyBreakdown: MonthlyDailyBreakdownRow[];
  coachCupsByDay: MonthlyCoachCupsByDayRow[];
  records: MonthlyCupRecordsRow | null;
  inventoryReport: MonthlyInventoryReportRow[];
  birthdays: Birthday[];
  isOwner: boolean;
  financeSummary: FinanceMonthlySummary | null;
}) {
  useEffect(() => {
    const t = setTimeout(() => window.print(), 400);
    return () => clearTimeout(t);
  }, []);

  const monthLabel = format(parse(month, "yyyy-MM", new Date()), "MMMM yyyy");
  const consumptionVp = inventoryOut.reduce((sum, r) => sum + Number(r.total_vp), 0);

  const packageCounts = Object.fromEntries(
    PACKAGE_LEVELS.map((level) => [level, packageSales.filter((r) => r.nc_level === level).length])
  ) as Record<(typeof PACKAGE_LEVELS)[number], number>;

  // customer_id -> every package-sale entry they have this month, across
  // levels — used to cross-reference a same-month upgrade (e.g. new 5-Day,
  // then renewed 30-Day) so it reads as one story, not two strangers.
  const entriesByCustomer = new Map<string, MonthlyPackageSaleRow[]>();
  for (const row of packageSales) {
    const list = entriesByCustomer.get(row.customer_id) ?? [];
    list.push(row);
    entriesByCustomer.set(row.customer_id, list);
  }

  const allDates = Array.from(new Set(coachCupsByDay.flatMap((c) => Object.keys(c.daily)))).sort();

  return (
    <div className="mx-auto max-w-[900px] px-4 py-6 print:max-w-none print:px-0 print:py-0">
      <style>{`
        @media print {
          @page { size: A4; margin: 14mm; }
          body { background: white; }
        }
      `}</style>

      <div className="mb-6 flex items-center justify-between print:hidden">
        <div>
          <h1 className="text-xl font-semibold">Monthly Report — {monthLabel}</h1>
          <p className="text-sm text-muted-foreground">{clubName}</p>
        </div>
        <Button onClick={() => window.print()}>
          <Printer className="size-4" /> Print / Save as PDF
        </Button>
      </div>

      {/* PAGE 1 — Summary */}
      <ReportPage footer="1 / 6">
        <PageHeader
          title="Monthly Report"
          clubName={clubName}
          monthLabel={monthLabel}
          meta={`Generated ${format(new Date(), "d MMM yyyy")}`}
        />

        <p className="mb-2 text-sm font-semibold">Monthly totals</p>
        <div className="mb-6 grid grid-cols-3 gap-3">
          <div className="rounded-md border-2 border-primary bg-primary/5 p-3">
            <p className="text-xs text-muted-foreground">Total cups</p>
            <p className="text-2xl font-bold text-primary">{totals.total_cups}</p>
          </div>
          <div className="rounded-md border p-3">
            <p className="text-xs text-muted-foreground">
              Avg cups / operating day ({totals.days_in_period} days)
            </p>
            <p className="text-2xl font-bold">{totals.avg_daily_cups}</p>
          </div>
          <div className="rounded-md border p-3">
            <p className="text-xs text-muted-foreground">Total Consumption VP</p>
            <p className="text-2xl font-bold">{consumptionVp.toFixed(2)}</p>
          </div>
        </div>

        <p className="mb-2 text-sm font-semibold">New &amp; renewed packages</p>
        <div className="mb-6 grid grid-cols-4 gap-2">
          {PACKAGE_LEVELS.map((level) => (
            <div key={level} className="rounded-md border p-2 text-center">
              <p className="text-lg font-bold">{packageCounts[level]}</p>
              <p className="text-[11px] text-muted-foreground">
                {level === "5-day" ? "New" : "New / Renew"} {PACKAGE_LABELS[level]}
              </p>
            </div>
          ))}
        </div>

        <p className="mb-2 text-sm font-semibold">Records this month</p>
        <div className="mb-6 grid grid-cols-3 gap-2">
          <div className="rounded-md border border-amber-300 bg-amber-50 p-2 dark:border-amber-900 dark:bg-amber-950/30">
            <p className="text-[10px] uppercase text-amber-700 dark:text-amber-500">Highest day</p>
            <p className="text-lg font-bold">{records?.highest_cups ?? "—"} cups</p>
            <p className="text-[11px] text-muted-foreground">{fmtDate(records?.highest_date ?? null, "EEE, d MMM")}</p>
          </div>
          <div className="rounded-md border border-rose-300 bg-rose-50 p-2 dark:border-rose-900 dark:bg-rose-950/30">
            <p className="text-[10px] uppercase text-rose-700 dark:text-rose-500">Lowest day</p>
            <p className="text-lg font-bold">{records?.lowest_cups ?? "—"} cups</p>
            <p className="text-[11px] text-muted-foreground">{fmtDate(records?.lowest_date ?? null, "EEE, d MMM")}</p>
          </div>
          <div className="rounded-md border bg-primary/5 p-2">
            <p className="text-[10px] uppercase text-primary">Top individual day</p>
            <p className="text-sm font-semibold">{records?.best_coach_name ?? "—"}</p>
            <p className="text-lg font-bold">{records?.best_coach_cups ?? "—"} cups</p>
            <p className="text-[11px] text-muted-foreground">
              {fmtDate(records?.best_coach_date ?? null, "EEE, d MMM")}
            </p>
          </div>
        </div>

        <p className="mb-2 text-sm font-semibold">Birthdays in {format(parse(month, "yyyy-MM", new Date()), "MMMM")}</p>
        <div className="flex flex-wrap gap-2">
          {birthdays.map((b) => (
            <span key={b.id} className="rounded-full border px-2.5 py-1 text-xs">
              {b.name} <span className="text-muted-foreground">· {b.day} {format(parse(month, "yyyy-MM", new Date()), "MMM")}</span>
            </span>
          ))}
          {birthdays.length === 0 && <p className="text-sm text-muted-foreground">No birthdays this month.</p>}
        </div>
      </ReportPage>

      {/* PAGE 2 — New & Renewed */}
      <ReportPage footer="2 / 6">
        <PageHeader
          title="New & Renewed"
          clubName={clubName}
          monthLabel={monthLabel}
          meta={`${packageSales.length} entries`}
        />
        <p className="mb-4 text-xs text-muted-foreground">
          Grouped by the level of each event, not by customer — someone who signs up 5-Day and
          upgrades to 30-Day in the same month shows up once in each list below, cross-referenced
          so it&apos;s clear it&apos;s the same person.
        </p>
        {PACKAGE_LEVELS.map((level) => {
          const rows = packageSales.filter((r) => r.nc_level === level);
          return (
            <div key={level} className="mb-5">
              <div className="mb-1.5 flex items-baseline justify-between">
                <p className="font-semibold">{PACKAGE_LABELS[level]}</p>
                <p className="text-xs text-muted-foreground">{rows.length} {rows.length === 1 ? "entry" : "entries"}</p>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-[11px] uppercase text-muted-foreground">
                    <th className="py-1">Customer</th>
                    <th className="py-1">Type</th>
                    <th className="py-1">Coach</th>
                    <th className="py-1 text-right">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => {
                    const otherEntries = (entriesByCustomer.get(r.customer_id) ?? []).filter(
                      (e) => e.nc_level !== r.nc_level
                    );
                    return (
                      <tr key={`${r.customer_id}-${r.nc_level}-${i}`} className="border-b last:border-0">
                        <td className="py-1.5">
                          {r.customer_name}
                          {otherEntries.map((e, j) => (
                            <span
                              key={j}
                              className="ml-2 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary"
                            >
                              ↳ also {PACKAGE_LABELS[e.nc_level as (typeof PACKAGE_LEVELS)[number]]}, {fmtDate(e.entry_date, "d MMM")}
                            </span>
                          ))}
                        </td>
                        <td className="py-1.5">
                          <span
                            className={
                              r.kind === "new"
                                ? "rounded bg-primary/10 px-1.5 py-0.5 text-[11px] text-primary"
                                : "rounded border px-1.5 py-0.5 text-[11px] text-muted-foreground"
                            }
                          >
                            {r.kind === "new" ? "New" : "Renewed"}
                          </span>
                        </td>
                        <td className="py-1.5 text-muted-foreground">{r.coach_name ?? "—"}</td>
                        <td className="py-1.5 text-right text-muted-foreground">{fmtDate(r.entry_date, "d MMM")}</td>
                      </tr>
                    );
                  })}
                  {rows.length === 0 && (
                    <tr>
                      <td colSpan={4} className="py-2 text-center text-muted-foreground">
                        None this month.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          );
        })}
      </ReportPage>

      {/* PAGE 3 — Daily Operations */}
      <ReportPage footer="3 / 6">
        <PageHeader
          title="Daily Operations"
          clubName={clubName}
          monthLabel={monthLabel}
          meta={`${totals.days_in_period} operating days`}
        />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-[11px] uppercase text-muted-foreground">
                <th className="py-1">Date</th>
                <th className="py-1 text-right">Total</th>
                <th className="py-1 text-right">Dine-in</th>
                <th className="py-1 text-right">Take-away</th>
                <th className="py-1 text-right">Plug-in</th>
                <th className="py-1 text-right">Consumption VP</th>
              </tr>
            </thead>
            <tbody>
              {dailyBreakdown.map((d) => (
                <tr key={d.checkin_date} className="border-b last:border-0">
                  <td className="py-1.5">{fmtDate(d.checkin_date, "d MMM (EEE)")}</td>
                  <td className="py-1.5 text-right font-medium">{d.total_cups}</td>
                  <td className="py-1.5 text-right">{d.dine_in_cups}</td>
                  <td className="py-1.5 text-right">{d.takeaway_cups}</td>
                  <td className="py-1.5 text-right">{d.plugin_cups}</td>
                  <td className="py-1.5 text-right">{Number(d.consumption_vp).toFixed(2)}</td>
                </tr>
              ))}
              {dailyBreakdown.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-2 text-center text-muted-foreground">
                    No operating days this month.
                  </td>
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-foreground font-semibold">
                <td className="py-1.5">Total</td>
                <td className="py-1.5 text-right">{totals.total_cups}</td>
                <td className="py-1.5 text-right">{dailyBreakdown.reduce((s, d) => s + d.dine_in_cups, 0)}</td>
                <td className="py-1.5 text-right">{dailyBreakdown.reduce((s, d) => s + d.takeaway_cups, 0)}</td>
                <td className="py-1.5 text-right">{dailyBreakdown.reduce((s, d) => s + d.plugin_cups, 0)}</td>
                <td className="py-1.5 text-right">{consumptionVp.toFixed(2)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </ReportPage>

      {/* PAGE 4 — Coach's Cup */}
      <ReportPage footer="4 / 6">
        <PageHeader title="Coach's Cup" clubName={clubName} monthLabel={monthLabel} meta={`${coachCupsByDay.length} coaches`} />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-[11px] uppercase text-muted-foreground">
                <th className="py-1">Date</th>
                {coachCupsByDay.map((c) => (
                  <th key={c.coach_id} className="py-1 text-right">
                    {c.coach_name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {allDates.map((date) => (
                <tr key={date} className="border-b last:border-0">
                  <td className="py-1.5">{fmtDate(date, "d MMM")}</td>
                  {coachCupsByDay.map((c) => (
                    <td key={c.coach_id} className="py-1.5 text-right">
                      {c.daily[date] ?? "—"}
                    </td>
                  ))}
                </tr>
              ))}
              {allDates.length === 0 && (
                <tr>
                  <td colSpan={1 + coachCupsByDay.length} className="py-2 text-center text-muted-foreground">
                    No qualifying check-ins this month.
                  </td>
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-foreground font-semibold">
                <td className="py-1.5">Monthly total</td>
                {coachCupsByDay.map((c) => (
                  <td key={c.coach_id} className="py-1.5 text-right">
                    {c.total_cups}
                  </td>
                ))}
              </tr>
            </tfoot>
          </table>
        </div>
      </ReportPage>

      {/* PAGE 5 — Finance */}
      <ReportPage footer="5 / 6">
        <PageHeader title="Finance Report" clubName={clubName} monthLabel={monthLabel} />
        {!isOwner || !financeSummary ? (
          <p className="text-sm text-muted-foreground">Finance is only visible to the club Owner.</p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-6">
              <div>
                <p className="mb-2 text-sm font-semibold">Income</p>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-[11px] uppercase text-muted-foreground">
                      <th className="py-1">Category</th>
                      <th className="py-1 text-right">Amount</th>
                      <th className="py-1 text-right">%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {financeSummary.incomeCategories
                      .filter((c) => c.total > 0)
                      .map((c) => (
                        <tr key={c.category} className="border-b last:border-0">
                          <td className="py-1">{c.category}</td>
                          <td className="py-1 text-right">RM {c.total.toFixed(2)}</td>
                          <td className="py-1 text-right">
                            {financeSummary.totalIncome > 0
                              ? ((c.total / financeSummary.totalIncome) * 100).toFixed(0)
                              : 0}
                            %
                          </td>
                        </tr>
                      ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-foreground font-semibold">
                      <td className="py-1">Total income</td>
                      <td className="py-1 text-right">RM {financeSummary.totalIncome.toFixed(2)}</td>
                      <td className="py-1 text-right">100%</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              <div>
                <p className="mb-2 text-sm font-semibold">Expense</p>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-[11px] uppercase text-muted-foreground">
                      <th className="py-1">Category</th>
                      <th className="py-1 text-right">Amount</th>
                      <th className="py-1 text-right">%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {financeSummary.expenseCategories
                      .filter((c) => c.total > 0)
                      .map((c) => (
                        <tr key={c.category} className="border-b last:border-0">
                          <td className="py-1">{c.category}</td>
                          <td className="py-1 text-right">RM {c.total.toFixed(2)}</td>
                          <td className="py-1 text-right">
                            {financeSummary.totalExpense > 0
                              ? ((c.total / financeSummary.totalExpense) * 100).toFixed(0)
                              : 0}
                            %
                          </td>
                        </tr>
                      ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-foreground font-semibold">
                      <td className="py-1">Total expense</td>
                      <td className="py-1 text-right">RM {financeSummary.totalExpense.toFixed(2)}</td>
                      <td className="py-1 text-right">100%</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
            <div className="mt-4 flex items-center justify-between rounded-md border bg-primary/5 px-4 py-2">
              <span className="text-xs font-medium uppercase text-primary">Net for {monthLabel}</span>
              <span className="text-lg font-bold">
                {financeSummary.net >= 0 ? "+" : "−"} RM {Math.abs(financeSummary.net).toFixed(2)}
              </span>
            </div>
          </>
        )}
      </ReportPage>

      {/* PAGE 6 — Inventory */}
      <ReportPage isLast footer="6 / 6">
        <PageHeader title="Inventory Report" clubName={clubName} monthLabel={monthLabel} />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-[11px] uppercase text-muted-foreground">
                <th className="py-1">Product</th>
                <th className="py-1 text-right">Opening</th>
                <th className="py-1 text-right">Restocked</th>
                <th className="py-1 text-right">Consumed</th>
                <th className="py-1 text-right">Sold</th>
                <th className="py-1 text-right">Closing</th>
              </tr>
            </thead>
            <tbody>
              {inventoryReport
                .filter(
                  (r) => r.opening_balance !== 0 || r.restocked_qty !== 0 || r.consumed_qty !== 0 || r.sold_qty !== 0
                )
                .map((r) => (
                  <tr key={r.product_id} className="border-b last:border-0">
                    <td className="py-1.5">{r.product_name}</td>
                    <td className="py-1.5 text-right">{r.opening_balance}</td>
                    <td className="py-1.5 text-right">{r.restocked_qty}</td>
                    <td className="py-1.5 text-right">{r.consumed_qty}</td>
                    <td className="py-1.5 text-right">{r.sold_qty}</td>
                    <td className="py-1.5 text-right font-medium">{r.closing_balance}</td>
                  </tr>
                ))}
              {inventoryReport.every(
                (r) => r.opening_balance === 0 && r.restocked_qty === 0 && r.consumed_qty === 0 && r.sold_qty === 0
              ) && (
                <tr>
                  <td colSpan={6} className="py-2 text-center text-muted-foreground">
                    No inventory movement this month.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </ReportPage>
    </div>
  );
}
