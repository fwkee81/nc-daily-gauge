import { redirect } from "next/navigation";
import { format } from "date-fns";
import { getCurrentCoach } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { DailyReportClient, type CheckinRow } from "./daily-report-client";

export default async function DailyReportPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; club?: string }>;
}) {
  const coach = await getCurrentCoach();
  if (!coach) redirect("/onboarding");

  const { date: dateParam, club: clubParam } = await searchParams;
  const date = dateParam ?? format(new Date(), "yyyy-MM-dd");
  const clubId = clubParam || coach.nc_club_id || "";
  const viewingBranch = Boolean(clubParam && clubParam !== coach.nc_club_id);

  const supabase = await createClient();

  const [totalsRes, coachCupsRes, birthdaysRes, checkinsRes, clubRes] = await Promise.all([
    supabase.rpc("daily_totals", { p_date: date, p_club_id: clubId }),
    supabase.rpc("daily_coach_cups", { p_date: date, p_club_id: clubId }),
    supabase.rpc("upcoming_birthdays", { p_club_id: clubId }),
    supabase
      .from("checkins")
      .select("id, cups, consumption_type, voided, created_at, customer:customers(name)")
      .eq("checkin_date", date)
      .eq("nc_club_id", clubId)
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
      totals={totalsRes.data?.[0] ?? { total_cups: 0, plugin_cups: 0 }}
      coachCups={coachCupsRes.data ?? []}
      birthdays={birthdaysRes.data ?? []}
      checkins={(checkinsRes.data ?? []) as unknown as CheckinRow[]}
    />
  );
}
