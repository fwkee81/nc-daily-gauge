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
    // NOTE: invited_by_customer is deliberately NOT embedded here via a
    // PostgREST join (customers!customers_invited_by_customer_id_fkey) —
    // PostgREST can't resolve a self-referential relationship on the same
    // table (PGRST200: "Could not find a relationship between 'customers'
    // and 'customers'"), which fails the *entire* query, not just that
    // field. Instead we resolve invited-by-customer names in JS below from
    // the same result set, since it already contains every customer.
    supabase
      .from("customers")
      .select("*, invited_by_coach:coaches!customers_invited_by_coach_id_fkey(id,name)")
      .eq("nc_club_id", coach.nc_club_id ?? "")
      .eq("active", true)
      .order("name"),
    supabase.from("coaches").select("id, name").eq("active", true).order("name"),
  ]);

  const rows = (customers ?? []) as unknown as CustomerRow[];
  const nameById = new Map(rows.map((c) => [c.id, c.name]));
  const rowsWithInvitedByCustomer = rows.map((c) => ({
    ...c,
    invited_by_customer: c.invited_by_customer_id
      ? { id: c.invited_by_customer_id, name: nameById.get(c.invited_by_customer_id) ?? "—" }
      : null,
  }));

  return <CustomersClient initialCustomers={rowsWithInvitedByCustomer} coaches={coaches ?? []} />;
}
