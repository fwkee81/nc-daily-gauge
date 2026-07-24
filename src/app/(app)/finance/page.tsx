import { redirect } from "next/navigation";
import { addMonths, format, parseISO } from "date-fns";
import { getCurrentCoach } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { FINANCE_EXPENSE_CATEGORIES, FINANCE_INCOME_CATEGORIES } from "@/lib/constants";
import {
  FinanceClient,
  type FinanceCategoryBreakdown,
  type FinanceMonthlySummary,
  type FinanceTxnRow,
} from "./finance-client";

export default async function FinancePage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; date?: string; month?: string }>;
}) {
  const coach = await getCurrentCoach();
  if (!coach) redirect("/onboarding");

  if (!coach.nc_club_id) {
    return (
      <div className="rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
        Join a club before using Finance.
      </div>
    );
  }

  const { view: viewParam, date: dateParam, month: monthParam } = await searchParams;
  const view = viewParam === "monthly" ? "monthly" : "daily";
  const date = dateParam ?? format(new Date(), "yyyy-MM-dd");
  const month = monthParam ?? format(new Date(), "yyyy-MM");
  const isOwner = coach.nc_position === "Owner";

  const monthStart = `${month}-01`;
  const nextMonthStart = format(addMonths(parseISO(monthStart), 1), "yyyy-MM-dd");

  const supabase = await createClient();
  const [txnsRes, coachesRes, monthlyRes] = await Promise.all([
    supabase
      .from("finance_transactions")
      .select(
        "id, direction, category, detail, amount, payment_method, customer_name, remark, created_at, voided, void_reason, responsible_coach:coaches!finance_transactions_responsible_coach_id_fkey(name), recorded_by_coach:coaches!finance_transactions_recorded_by_fkey(name), voided_by_coach:coaches!finance_transactions_voided_by_fkey(name)"
      )
      .eq("nc_club_id", coach.nc_club_id)
      .eq("txn_date", date)
      .order("created_at", { ascending: false }),
    supabase
      .from("coaches")
      .select("id, name")
      .eq("nc_club_id", coach.nc_club_id)
      .eq("active", true)
      .order("name"),
    isOwner
      ? supabase
          .from("finance_transactions")
          .select("direction, category, amount, payment_method, voided")
          .eq("nc_club_id", coach.nc_club_id)
          .gte("txn_date", monthStart)
          .lt("txn_date", nextMonthStart)
      : Promise.resolve({ data: null }),
  ]);

  interface RawTxn {
    id: string;
    direction: "in" | "out";
    category: string;
    detail: string | null;
    amount: number;
    payment_method: string;
    customer_name: string | null;
    remark: string | null;
    created_at: string;
    voided: boolean;
    void_reason: string | null;
    responsible_coach: { name: string } | null;
    recorded_by_coach: { name: string } | null;
    voided_by_coach: { name: string } | null;
  }

  const transactions: FinanceTxnRow[] = ((txnsRes.data ?? []) as unknown as RawTxn[]).map((t) => ({
    id: t.id,
    direction: t.direction,
    category: t.category,
    detail: t.detail,
    amount: t.amount,
    paymentMethod: t.payment_method,
    customerName: t.customer_name,
    remark: t.remark,
    responsibleCoachName: t.responsible_coach?.name ?? null,
    recordedByCoachName: t.recorded_by_coach?.name ?? null,
    createdAt: t.created_at,
    voided: t.voided,
    voidReason: t.void_reason,
    voidedByCoachName: t.voided_by_coach?.name ?? null,
  }));

  let monthlySummary: FinanceMonthlySummary | null = null;
  if (isOwner) {
    interface RawMonthlyTxn {
      direction: "in" | "out";
      category: string;
      amount: number;
      payment_method: string;
      voided: boolean;
    }

    const rows = ((monthlyRes.data ?? []) as unknown as RawMonthlyTxn[]).filter((r) => !r.voided);
    const incomeRows = rows.filter((r) => r.direction === "in");
    const expenseRows = rows.filter((r) => r.direction === "out");

    const totalIncome = incomeRows.reduce((s, r) => s + r.amount, 0);
    const totalExpense = expenseRows.reduce((s, r) => s + r.amount, 0);

    const incomeByPayment: Record<string, number> = {};
    for (const r of incomeRows) {
      incomeByPayment[r.payment_method] = (incomeByPayment[r.payment_method] ?? 0) + r.amount;
    }

    function categoryBreakdown(
      categories: readonly string[],
      categoryRows: RawMonthlyTxn[]
    ): FinanceCategoryBreakdown[] {
      return categories.map((category) => {
        const matches = categoryRows.filter((r) => r.category === category);
        return {
          category,
          count: matches.length,
          total: matches.reduce((s, r) => s + r.amount, 0),
        };
      });
    }

    monthlySummary = {
      totalIncome,
      totalExpense,
      net: totalIncome - totalExpense,
      incomeByPayment,
      incomeCategories: categoryBreakdown(FINANCE_INCOME_CATEGORIES, incomeRows),
      expenseCategories: categoryBreakdown(FINANCE_EXPENSE_CATEGORIES, expenseRows),
    };
  }

  return (
    <FinanceClient
      date={date}
      hasExplicitDate={Boolean(dateParam)}
      view={view}
      month={month}
      hasExplicitMonth={Boolean(monthParam)}
      transactions={transactions}
      monthlySummary={monthlySummary}
      coaches={coachesRes.data ?? []}
      isOwner={isOwner}
      isAdmin={coach.is_admin}
    />
  );
}
