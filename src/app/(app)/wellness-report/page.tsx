import { redirect } from "next/navigation";
import { getCurrentCoach } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { WellnessReportList, type WellnessReportCustomerRow } from "./wellness-report-list";

export default async function WellnessReportPage({
  searchParams,
}: {
  searchParams: Promise<{ club?: string }>;
}) {
  const coach = await getCurrentCoach();
  if (!coach) redirect("/onboarding");
  if (!coach.is_admin) {
    return (
      <div className="rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
        Only the club Owner or Internship coach can view the Wellness Report.
      </div>
    );
  }

  const { club: clubParam } = await searchParams;
  const clubId = clubParam || coach.nc_club_id || "";
  const viewingBranch = Boolean(clubParam && clubParam !== coach.nc_club_id);

  const supabase = await createClient();

  const [{ data: customers }, { data: clubRow }] = await Promise.all([
    supabase
      .from("customers")
      .select("id, name, contact, nc_level, active")
      .eq("nc_club_id", clubId)
      .order("name"),
    viewingBranch
      ? supabase.from("nc_clubs").select("name").eq("id", clubId).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const customerIds = (customers ?? []).map((c) => c.id);
  const { data: wellnessUsers } = await supabase
    .from("wellness_users")
    .select("customer_id")
    .in("customer_id", customerIds.length > 0 ? customerIds : [""]);

  const joinedIds = new Set((wellnessUsers ?? []).map((w) => w.customer_id));
  const rows: WellnessReportCustomerRow[] = (customers ?? []).map((c) => ({
    ...c,
    joinedWellness: joinedIds.has(c.id),
  }));

  return (
    <div>
      <h1 className="text-2xl font-semibold">Wellness Report</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Click a customer to see their full My Wellness health profile and readings history.
      </p>
      <WellnessReportList
        customers={rows}
        viewingBranch={viewingBranch}
        clubName={clubRow?.name ?? null}
      />
    </div>
  );
}
