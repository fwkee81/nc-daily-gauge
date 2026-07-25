"use server";

import { createClient } from "@/lib/supabase/server";

// Shared by every "click a customer's name" popup (Daily Report, Customers
// page, ...) so they all read the same fields instead of drifting apart.
export async function getCustomerProfile(customerId: string) {
  const supabase = await createClient();

  const { data: customer, error } = await supabase
    .from("customers")
    .select(
      "id, name, gender, contact, dob, age_override, nc_level, consumption_balance, invited_by_type, invited_by_coach_id, invited_by_customer_id, member_id, member_type, remark, is_pjs, is_health_ambassador, active, coach:coaches!customers_coach_id_fkey(name), invited_by_coach:coaches!customers_invited_by_coach_id_fkey(name)"
    )
    .eq("id", customerId)
    .single();

  if (error || !customer) return { error: error?.message ?? "Customer not found." };

  // invited_by_customer is deliberately NOT embedded via a PostgREST join
  // above — a self-referential relationship on the same table (PGRST200)
  // fails the entire query. Resolve it with a plain, separate lookup.
  let invitedByCustomerName: string | null = null;
  if (customer.invited_by_customer_id) {
    const { data: invitedBy } = await supabase
      .from("customers")
      .select("name")
      .eq("id", customer.invited_by_customer_id)
      .maybeSingle();
    invitedByCustomerName = invitedBy?.name ?? null;
  }

  const { data: members } = await supabase
    .from("customer_members")
    .select("id, name, contact, dob")
    .eq("customer_id", customerId)
    .eq("active", true)
    .order("name");

  return { data: { ...customer, invitedByCustomerName, members: members ?? [] } };
}
