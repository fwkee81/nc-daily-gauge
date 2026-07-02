import { redirect } from "next/navigation";
import { addDays, format, parseISO } from "date-fns";
import { getCurrentCoach } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { DailyReportClient, type CheckinRow, type RenewalRow } from "./daily-report-client";

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

  const [totalsRes, coachCupsRes, birthdaysRes, checkinsRes, renewalsRes, clubRes] = await Promise.all([
    supabase.rpc("daily_totals", { p_date: date, p_club_id: clubId }),
    supabase.rpc("daily_coach_cups", { p_date: date, p_club_id: clubId }),
    supabase.rpc("upcoming_birthdays", { p_club_id: clubId }),
    supabase
      .from("checkins")
      .select("id, cups, consumption_type, voided, created_at, customer:customers(name)")
      .eq("checkin_date", date)
      .eq("nc_club_id", clubId)
      .order("created_at", { ascending: false }),
    // NOTE: filtering on the embedded `customer` resource requires !inner
    // (an outer/left embed's columns can't be used in .eq() filters).
    supabase
      .from("customer_renewals")
      .select(
        "id, nc_level, cups_added, previous_balance, new_balance, created_at, customer:customers!inner(name, nc_club_id), renewed_by_coach:coaches(name)"
      )
      .gte("created_at", `${date}T00:00:00`)
      .lt("created_at", `${nextDate}T00:00:00`)
      .eq("customer.nc_club_id", clubId)
      .order("created_at", { ascending: false }),
    supabase.from("nc_clubs").select("name").eq("id", clubId).maybeSingle(),
  ]);

  return (
    <DailyReportClient
      date={date}
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
      birthdays={birthdaysRes.data ?? []}
      checkins={(checkinsRes.data ?? []) as unknown as CheckinRow[]}
      renewals={(renewalsRes.data ?? []) as unknown as RenewalRow[]}
    />
  );
}
