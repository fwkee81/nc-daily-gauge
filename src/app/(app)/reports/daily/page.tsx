import { redirect } from "next/navigation";
import { format } from "date-fns";
import { getCurrentCoach } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { DailyReportClient, type CheckinRow } from "./daily-report-client";

export default async function DailyReportPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const coach = await getCurrentCoach();
  if (!coach) redirect("/onboarding");

  const { date: dateParam } = await searchParams;
  const date = dateParam ?? format(new Date(), "yyyy-MM-dd");

  const supabase = await createClient();

  const [totalsRes, coachCupsRes, birthdaysRes, checkinsRes] = await Promise.all([
    supabase.rpc("daily_totals", { p_date: date }),
    supabase.rpc("daily_coach_cups", { p_date: date }),
    supabase.rpc("upcoming_birthdays"),
    supabase
      .from("checkins")
      .select("id, cups, consumption_type, voided, created_at, customer:customers(name)")
      .eq("checkin_date", date)
      .order("created_at", { ascending: false }),
  ]);

  return (
    <DailyReportClient
      date={date}
      isAdmin={coach.is_admin}
      totals={totalsRes.data?.[0] ?? { total_cups: 0, plugin_cups: 0 }}
      coachCups={coachCupsRes.data ?? []}
      birthdays={birthdaysRes.data ?? []}
      checkins={(checkinsRes.data ?? []) as unknown as CheckinRow[]}
    />
  );
}
