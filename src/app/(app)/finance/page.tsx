import { redirect } from "next/navigation";
import { format } from "date-fns";
import { getCurrentCoach, getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { SUPER_ADMIN_EMAIL } from "@/lib/constants";
import { FinanceClient, type FinanceTxnRow } from "./finance-client";

export default async function FinancePage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const coach = await getCurrentCoach();
  if (!coach) redirect("/onboarding");

  // Soft-launch: Finance is only visible to the super admin for now, not
  // rolled out to every coach yet. Remove this gate (and the matching one in
  // NavLinks) when it's ready for general use.
  const user = await getCurrentUser();
  if (user?.email !== SUPER_ADMIN_EMAIL) {
    return (
      <div className="rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
        Finance isn&apos;t available yet.
      </div>
    );
  }

  if (!coach.nc_club_id) {
    return (
      <div className="rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
        Join a club before using Finance.
      </div>
    );
  }

  const { date: dateParam } = await searchParams;
  const date = dateParam ?? format(new Date(), "yyyy-MM-dd");

  const supabase = await createClient();
  const [txnsRes, coachesRes] = await Promise.all([
    supabase
      .from("finance_transactions")
      .select(
        "id, direction, category, detail, amount, payment_method, customer_name, created_at, voided, void_reason, responsible_coach:coaches!finance_transactions_responsible_coach_id_fkey(name), recorded_by_coach:coaches!finance_transactions_recorded_by_fkey(name), voided_by_coach:coaches!finance_transactions_voided_by_fkey(name)"
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
  ]);

  interface RawTxn {
    id: string;
    direction: "in" | "out";
    category: string;
    detail: string | null;
    amount: number;
    payment_method: string;
    customer_name: string | null;
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
    responsibleCoachName: t.responsible_coach?.name ?? null,
    recordedByCoachName: t.recorded_by_coach?.name ?? null,
    createdAt: t.created_at,
    voided: t.voided,
    voidReason: t.void_reason,
    voidedByCoachName: t.voided_by_coach?.name ?? null,
  }));

  return (
    <FinanceClient
      date={date}
      hasExplicitDate={Boolean(dateParam)}
      transactions={transactions}
      coaches={coachesRes.data ?? []}
      isOwner={coach.nc_position === "Owner"}
      isAdmin={coach.is_admin}
    />
  );
}
