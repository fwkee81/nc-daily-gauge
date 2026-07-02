import { redirect } from "next/navigation";
import { getCurrentCoach } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { CustomersClient, type CustomerRow } from "./customers-client";

export default async function AdminCustomersPage() {
  const coach = await getCurrentCoach();
  if (!coach) redirect("/onboarding");
  if (!coach.is_admin) {
    return (
      <div className="rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
        Only the club Owner or Internship coach can manage customers.
      </div>
    );
  }

  const supabase = await createClient();

  const [{ data: customers }, { data: coaches }] = await Promise.all([
    supabase
      .from("customers")
      .select(
        "*, invited_by_coach:coaches!customers_invited_by_coach_id_fkey(id,name), invited_by_customer:customers!customers_invited_by_customer_id_fkey(id,name)"
      )
      .eq("nc_club_id", coach.nc_club_id ?? "")
      .eq("active", true)
      .order("name"),
    supabase.from("coaches").select("id, name").order("name"),
  ]);

  return (
    <CustomersClient
      initialCustomers={(customers ?? []) as unknown as CustomerRow[]}
      coaches={coaches ?? []}
    />
  );
}
