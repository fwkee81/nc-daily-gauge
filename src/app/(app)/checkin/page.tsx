import { redirect } from "next/navigation";
import { getCurrentCoach } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { CheckinClient } from "./checkin-client";

export default async function CheckinPage() {
  const coach = await getCurrentCoach();
  if (!coach) redirect("/onboarding");

  const supabase = await createClient();
  const [{ data: customers }, { data: coaches }, { data: club }, { data: recentWalkins }] =
    await Promise.all([
      supabase
        .from("customers")
        .select("id, name, contact, dob, consumption_balance, linked_to_customer_id")
        .eq("nc_club_id", coach.nc_club_id ?? "")
        .eq("active", true)
        .order("name"),
      supabase
        .from("coaches")
        .select("id, name")
        .eq("nc_club_id", coach.nc_club_id ?? "")
        .eq("active", true)
        .order("name"),
      supabase.from("nc_clubs").select("name").eq("id", coach.nc_club_id ?? "").maybeSingle(),
      supabase.rpc("recent_walkin_customers", { p_club_id: coach.nc_club_id ?? null }),
    ]);

  const customerIds = (customers ?? []).map((c) => c.id);
  const { data: members } = await supabase
    .from("customer_members")
    .select("id, customer_id, name, contact, dob")
    .in("customer_id", customerIds.length > 0 ? customerIds : [""])
    .eq("active", true)
    .order("name");

  const customerById = new Map((customers ?? []).map((c) => [c.id, c]));

  // A linked customer's own consumption_balance is always kept at 0 (see
  // link_customer_to_spouse()) — the real number lives on whoever they're
  // linked to, one hop max (no chains), same idea as a family member's
  // balance living on their account holder.
  function resolveBalance(customerId: string): number {
    const c = customerById.get(customerId);
    if (!c) return 0;
    if (!c.linked_to_customer_id) return c.consumption_balance;
    return customerById.get(c.linked_to_customer_id)?.consumption_balance ?? c.consumption_balance;
  }

  const checkinOptions = [
    ...(customers ?? []).map((c) => ({
      key: c.id,
      customerId: c.id,
      memberId: null as string | null,
      name: c.name,
      contact: c.contact,
      dob: c.dob,
      consumptionBalance: resolveBalance(c.id),
    })),
    ...(members ?? []).map((m) => ({
      key: m.id,
      customerId: m.customer_id,
      memberId: m.id,
      name: m.name,
      // A family member without their own contact falls back to the account
      // holder's, so the last-4-digits search still finds them.
      contact: m.contact ?? "",
      dob: m.dob,
      consumptionBalance: resolveBalance(m.customer_id),
    })),
  ].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <CheckinClient
      checkinOptions={checkinOptions}
      customers={customers ?? []}
      coaches={coaches ?? []}
      recentWalkins={recentWalkins ?? []}
      isAdmin={coach.is_admin}
      clubName={club?.name ?? null}
    />
  );
}
