import { redirect } from "next/navigation";
import { addMonths, format, parseISO } from "date-fns";
import { getCurrentCoach } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { FINANCE_EXPENSE_CATEGORIES, FINANCE_INCOME_CATEGORIES } from "@/lib/constants";
import type {
  MonthlyCoachCupsByDayRow,
  MonthlyCupRecordsRow,
  MonthlyDailyBreakdownRow,
  MonthlyInventoryOutRow,
  MonthlyInventoryReportRow,
  MonthlyPackageSaleRow,
} from "@/lib/types/database";
import { MonthlyReportClient } from "./monthly-report-client";
import type { FinanceCategoryBreakdown, FinanceMonthlySummary } from "@/app/(app)/finance/finance-client";

interface RawMonthlyTxn {
  direction: "in" | "out";
  category: string;
  amount: number;
  voided: boolean;
}

// Same category-breakdown math as Finance's own Monthly view
// (src/app/(app)/finance/page.tsx) — kept in lockstep with it deliberately,
// since this report's Finance page is meant to read as "the same numbers,
// just printed."
function categoryBreakdown(
  categories: readonly string[],
  categoryRows: RawMonthlyTxn[]
): FinanceCategoryBreakdown[] {
  return categories.map((category) => {
    const matches = categoryRows.filter((r) => r.category === category);
    return { category, count: matches.length, total: matches.reduce((s, r) => s + r.amount, 0) };
  });
}

// Same month-filter logic as birthdaysInMonth() in metrics-client.tsx —
// duplicated rather than imported since that one lives in a "use client"
// file and takes the Demographics tab's wider customer shape.
function birthdaysInMonth(customers: { id: string; name: string; dob: string | null }[], targetMonth: number) {
  return customers
    .filter((c) => c.dob)
    .map((c) => {
      const [, monthStr, dayStr] = c.dob!.split("-");
      return { id: c.id, name: c.name, month: Number(monthStr), day: Number(dayStr) };
    })
    .filter((c) => c.month === targetMonth)
    .sort((a, b) => a.day - b.day);
}

export default async function MonthlyReportPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; club?: string }>;
}) {
  const coach = await getCurrentCoach();
  if (!coach) redirect("/onboarding");
  if (!coach.nc_club_id) {
    return (
      <div className="rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
        Join a club before generating a Monthly Report.
      </div>
    );
  }

  const { month: monthParam, club: clubParam } = await searchParams;
  const month = monthParam ?? format(new Date(), "yyyy-MM");
  const clubId = clubParam || coach.nc_club_id;
  const isOwner = coach.nc_position === "Owner";

  const monthStart = `${month}-01`;
  const nextMonthStart = format(addMonths(parseISO(monthStart), 1), "yyyy-MM-dd");

  const supabase = await createClient();

  const [
    totalsRes,
    packageSalesRes,
    inventoryOutRes,
    dailyBreakdownRes,
    coachCupsByDayRes,
    recordsRes,
    inventoryReportRes,
    clubRes,
    customersRes,
    financeRes,
  ] = await Promise.all([
    supabase.rpc("monthly_totals", { p_month: monthStart, p_club_id: clubId }),
    supabase.rpc("monthly_package_sales", { p_month: monthStart, p_club_id: clubId }),
    supabase.rpc("monthly_inventory_out", { p_month: monthStart, p_club_id: clubId }),
    supabase.rpc("monthly_daily_breakdown", { p_month: monthStart, p_club_id: clubId }),
    supabase.rpc("monthly_coach_cups_by_day", { p_month: monthStart, p_club_id: clubId }),
    supabase.rpc("monthly_cup_records", { p_month: monthStart, p_club_id: clubId }),
    supabase.rpc("monthly_inventory_report", { p_month: monthStart, p_club_id: clubId }),
    supabase.from("nc_clubs").select("name").eq("id", clubId).maybeSingle(),
    supabase.from("customers").select("id, name, dob").eq("nc_club_id", clubId).eq("active", true),
    isOwner
      ? supabase
          .from("finance_transactions")
          .select("direction, category, amount, voided")
          .eq("nc_club_id", clubId)
          .gte("txn_date", monthStart)
          .lt("txn_date", nextMonthStart)
      : Promise.resolve({ data: null }),
  ]);

  let financeSummary: FinanceMonthlySummary | null = null;
  if (isOwner) {
    const rows = ((financeRes.data ?? []) as unknown as RawMonthlyTxn[]).filter((r) => !r.voided);
    const incomeRows = rows.filter((r) => r.direction === "in");
    const expenseRows = rows.filter((r) => r.direction === "out");
    const totalIncome = incomeRows.reduce((s, r) => s + r.amount, 0);
    const totalExpense = expenseRows.reduce((s, r) => s + r.amount, 0);

    financeSummary = {
      totalIncome,
      totalExpense,
      net: totalIncome - totalExpense,
      incomeByPayment: {},
      incomeCategories: categoryBreakdown(FINANCE_INCOME_CATEGORIES, incomeRows),
      expenseCategories: categoryBreakdown(FINANCE_EXPENSE_CATEGORIES, expenseRows),
    };
  }

  const targetMonthNum = Number(month.split("-")[1]);

  return (
    <MonthlyReportClient
      clubName={clubRes.data?.name ?? "—"}
      month={month}
      totals={totalsRes.data?.[0] ?? { total_cups: 0, days_in_period: 0, avg_daily_cups: 0 }}
      packageSales={(packageSalesRes.data ?? []) as MonthlyPackageSaleRow[]}
      inventoryOut={(inventoryOutRes.data ?? []) as MonthlyInventoryOutRow[]}
      dailyBreakdown={(dailyBreakdownRes.data ?? []) as MonthlyDailyBreakdownRow[]}
      coachCupsByDay={(coachCupsByDayRes.data ?? []) as MonthlyCoachCupsByDayRow[]}
      records={(recordsRes.data?.[0] ?? null) as MonthlyCupRecordsRow | null}
      inventoryReport={(inventoryReportRes.data ?? []) as MonthlyInventoryReportRow[]}
      birthdays={birthdaysInMonth(customersRes.data ?? [], targetMonthNum)}
      isOwner={isOwner}
      financeSummary={financeSummary}
    />
  );
}
