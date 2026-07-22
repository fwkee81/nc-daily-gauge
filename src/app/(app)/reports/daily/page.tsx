import { redirect } from "next/navigation";
import { addDays, format, parseISO } from "date-fns";
import { getCurrentCoach } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  DailyReportClient,
  type CheckinRow,
  type DailyLogEntry,
  type LedgerRow,
} from "./daily-report-client";

export default async function DailyReportPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; club?: string }>;
}) {
  const coach = await getCurrentCoach();
  if (!coach) redirect("/onboarding");

  const { date: dateParam, club: clubParam } = await searchParams;
  const date = dateParam ?? format(new Date(), "yyyy-MM-dd");
  const nextDate = format(addDays(parseISO(date), 1), "yyyy-MM-dd");
  const clubId = clubParam || coach.nc_club_id || "";
  const viewingBranch = Boolean(clubParam && clubParam !== coach.nc_club_id);

  const supabase = await createClient();

  const [
    totalsRes,
    coachCupsRes,
    branchCoachCupsRes,
    birthdaysRes,
    checkinsRes,
    renewalsRes,
    newCustomersRes,
    clubRes,
    excludedCustomersRes,
    pluginLineageRes,
    dailyLogsRes,
  ] = await Promise.all([
    supabase.rpc("daily_totals", { p_date: date, p_club_id: clubId }),
    supabase.rpc("daily_coach_cups", { p_date: date, p_club_id: clubId }),
    supabase.rpc("daily_branch_coach_cups", { p_date: date, p_club_id: clubId }),
    supabase.rpc("upcoming_birthdays", { p_club_id: clubId }),
    supabase
      .from("checkins")
      .select(
        "id, customer_id, cups, consumption_type, voided, is_birthday_shake, created_at, customer:customers(name, nc_level, consumption_balance, coach:coaches!customers_coach_id_fkey(id, name)), member:customer_members(name)"
      )
      .eq("checkin_date", date)
      .eq("nc_club_id", clubId)
      .order("created_at", { ascending: false }),
    // NOTE: filtering on the embedded `customer` resource requires !inner
    // (an outer/left embed's columns can't be used in .eq() filters).
    supabase
      .from("customer_renewals")
      .select(
        "id, nc_level, cups_added, previous_balance, new_balance, reason, created_at, customer:customers!inner(name, nc_club_id), renewed_by_coach:coaches(name)"
      )
      .gte("created_at", `${date}T00:00:00`)
      .lt("created_at", `${nextDate}T00:00:00`)
      .eq("customer.nc_club_id", clubId)
      .order("created_at", { ascending: false }),
    // Newly added customers that day show up alongside renewals — a brand
    // new sign-up is the first entry in a customer's cup ledger.
    supabase
      .from("customers")
      .select(
        "id, name, nc_level, consumption_balance, created_at, created_by_coach:coaches!customers_created_by_fkey(name)"
      )
      .eq("nc_club_id", clubId)
      .gte("created_at", `${date}T00:00:00`)
      .lt("created_at", `${nextDate}T00:00:00`)
      .order("created_at", { ascending: false }),
    supabase.from("nc_clubs").select("name").eq("id", clubId).maybeSingle(),
    // Every customer disqualified from Coach's Cup — own or an ancestor's
    // (any generations back, via invited_by_customer_id) member_type is
    // SP/WT/AWT/TAB. Computed once server-side (recursive) and reused here.
    supabase.rpc("coach_cup_excluded_customer_ids", { p_club_id: clubId }),
    // Every customer descended from a Plug-in-invited root, any number of
    // generations — mirrors the exclusion query above but for Plug-in Cups.
    supabase.rpc("plugin_lineage_customer_ids", { p_club_id: clubId }),
    // "What happened today" log — a running list of free-text entries for
    // this club/date, not tied to any customer or ledger row.
    supabase
      .from("daily_report_logs")
      .select("id, note, created_at, created_by_coach:coaches(name)")
      .eq("nc_club_id", clubId)
      .eq("log_date", date)
      .order("created_at", { ascending: false }),
  ]);

  interface RawRenewal {
    id: string;
    nc_level: string;
    cups_added: number;
    previous_balance: number;
    new_balance: number;
    reason: string | null;
    created_at: string;
    customer: { name: string } | null;
    renewed_by_coach: { name: string } | null;
  }

  interface RawNewCustomer {
    id: string;
    name: string;
    nc_level: string;
    consumption_balance: number;
    created_at: string;
    created_by_coach: { name: string } | null;
  }

  const rawRenewals = (renewalsRes.data ?? []) as unknown as RawRenewal[];
  const rawNewCustomers = (newCustomersRes.data ?? []) as unknown as RawNewCustomer[];

  const renewalEntries: LedgerRow[] = rawRenewals.map((r) => ({
    id: r.id,
    kind: "renewal",
    customerName: r.customer?.name ?? "—",
    ncLevel: r.nc_level,
    cupsAdded: r.cups_added,
    previousBalance: r.previous_balance,
    newBalance: r.new_balance,
    byCoachName: r.renewed_by_coach?.name ?? null,
    createdAt: r.created_at,
    reason: r.reason,
  }));

  const newCustomerEntries: LedgerRow[] = rawNewCustomers.map((c) => ({
    id: c.id,
    kind: "new",
    customerName: c.name,
    ncLevel: c.nc_level,
    cupsAdded: c.consumption_balance,
    previousBalance: 0,
    newBalance: c.consumption_balance,
    byCoachName: c.created_by_coach?.name ?? null,
    createdAt: c.created_at,
    reason: null,
  }));

  const ledger = [...renewalEntries, ...newCustomerEntries].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt)
  );

  interface RawDailyLog {
    id: string;
    note: string;
    created_at: string;
    created_by_coach: { name: string } | null;
  }

  const dailyLogs: DailyLogEntry[] = ((dailyLogsRes.data ?? []) as unknown as RawDailyLog[]).map(
    (l) => ({
      id: l.id,
      note: l.note,
      coachName: l.created_by_coach?.name ?? null,
      createdAt: l.created_at,
    })
  );

  return (
    <DailyReportClient
      date={date}
      hasExplicitDate={Boolean(dateParam)}
      clubId={clubId}
      clubName={clubRes.data?.name ?? null}
      viewingBranch={viewingBranch}
      isAdmin={coach.is_admin && !viewingBranch}
      totals={
        totalsRes.data?.[0] ?? {
          total_cups: 0,
          plugin_cups: 0,
          coach_cup_total: 0,
          dine_in_cups: 0,
          takeaway_cups: 0,
        }
      }
      coachCups={coachCupsRes.data ?? []}
      branchCoachCups={branchCoachCupsRes.data ?? []}
      birthdays={birthdaysRes.data ?? []}
      checkins={(checkinsRes.data ?? []) as unknown as CheckinRow[]}
      excludedCustomerIds={(excludedCustomersRes.data ?? []).map((c) => c.customer_id)}
      pluginCustomerIds={(pluginLineageRes.data ?? []).map((c) => c.customer_id)}
      ledger={ledger}
      dailyLogs={dailyLogs}
    />
  );
}
