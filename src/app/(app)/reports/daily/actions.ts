"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ConsumptionType } from "@/lib/types/database";

export async function correctCheckinAction(
  checkinId: string,
  newCups: number,
  newConsumptionType: ConsumptionType,
  reason: string,
  newIsBirthdayShake: boolean = false
) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("correct_checkin", {
    p_checkin_id: checkinId,
    p_new_cups: newCups,
    p_new_consumption_type: newConsumptionType,
    p_reason: reason,
    p_new_is_birthday_shake: newIsBirthdayShake,
  });

  if (error) return { error: error.message };
  revalidatePath("/reports/daily");
  return { success: true };
}

export async function voidCheckinAction(checkinId: string, reason: string) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("void_checkin", {
    p_checkin_id: checkinId,
    p_reason: reason,
  });

  if (error) return { error: error.message };
  revalidatePath("/reports/daily");
  return { success: true };
}

export async function getCheckinHistory(checkinId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("checkin_edits")
    .select("id, field_changed, old_value, new_value, reason, created_at, editor:coaches(name)")
    .eq("checkin_id", checkinId)
    .order("created_at", { ascending: false });

  if (error) return { error: error.message };
  return { data: data ?? [] };
}

export async function getCustomerProfile(customerId: string) {
  const supabase = await createClient();

  const { data: customer, error } = await supabase
    .from("customers")
    .select(
      "id, name, gender, contact, dob, age_override, nc_level, consumption_balance, invited_by_type, invited_by_coach_id, invited_by_customer_id, member_id, member_type, remark, active, coach:coaches!customers_coach_id_fkey(name), invited_by_coach:coaches!customers_invited_by_coach_id_fkey(name)"
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
