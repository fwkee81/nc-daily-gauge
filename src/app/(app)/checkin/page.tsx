import { redirect } from "next/navigation";
import { getCurrentCoach } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { CheckinClient } from "./checkin-client";

export default async function CheckinPage() {
  const coach = await getCurrentCoach();
  if (!coach) redirect("/onboarding");

  const supabase = await createClient();
  const [{ data: customers }, { data: coaches }] = await Promise.all([
    supabase
      .from("customers")
      .select("id, name, contact, dob, consumption_balance")
      .eq("nc_club_id", coach.nc_club_id ?? "")
      .eq("active", true)
      .order("name"),
    supabase
      .from("coaches")
      .select("id, name")
      .eq("nc_club_id", coach.nc_club_id ?? "")
      .eq("active", true)
      .order("name"),
  ]);

  const customerIds = (customers ?? []).map((c) => c.id);
  const { data: members } = await supabase
    .from("customer_members")
    .select("id, customer_id, name, contact, dob")
    .in("customer_id", customerIds.length > 0 ? customerIds : [""])
    .eq("active", true)
    .order("name");

  const balanceByCustomerId = new Map((customers ?? []).map((c) => [c.id, c.consumption_balance]));

  const checkinOptions = [
    ...(customers ?? []).map((c) => ({
      key: c.id,
      customerId: c.id,
      memberId: null as string | null,
      name: c.name,
      contact: c.contact,
      consumptionBalance: c.consumption_balance,
    })),
    ...(members ?? []).map((m) => ({
      key: m.id,
      customerId: m.customer_id,
      memberId: m.id,
      name: m.name,
      // A family member without their own contact falls back to the account
      // holder's, so the last-4-digits search still finds them.
      contact: m.contact ?? "",
      consumptionBalance: balanceByCustomerId.get(m.customer_id) ?? 0,
    })),
  ].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <CheckinClient
      checkinOptions={checkinOptions}
      customers={customers ?? []}
      coaches={coaches ?? []}
      isAdmin={coach.is_admin}
    />
  );
}
