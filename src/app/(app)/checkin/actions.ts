"use server";

import { createClient } from "@/lib/supabase/server";
import type { ConsumptionType, InvitedByType } from "@/lib/types/database";

export async function submitCheckin(
  customerId: string,
  cups: number,
  consumptionType: ConsumptionType,
  checkinDate: string,
  memberId: string | null = null,
  isBirthdayShake: boolean = false
) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("record_checkin", {
    p_customer_id: customerId,
    p_cups: cups,
    p_consumption_type: consumptionType,
    p_checkin_date: checkinDate,
    p_member_id: memberId,
    p_is_birthday_shake: isBirthdayShake,
  });

  if (error) {
    return { error: error.message };
  }

  const { data: customer, error: customerError } = await supabase
    .from("customers")
    .select("name, consumption_balance, nc_level")
    .eq("id", customerId)
    .single();

  if (customerError || !customer) {
    return { error: customerError?.message ?? "Check-in recorded but could not load balance." };
  }

  // Show the family member's own name when they checked in themselves,
  // even though the balance shown is the shared account's.
  let displayName = customer.name;
  if (memberId) {
    const { data: member } = await supabase
      .from("customer_members")
      .select("name")
      .eq("id", memberId)
      .single();
    if (member) displayName = member.name;
  }

  return {
    success: true,
    checkin: data,
    name: displayName,
    balance: customer.consumption_balance,
    ncLevel: customer.nc_level,
    isBirthdayShake,
  };
}

export async function submitWalkinCheckin(input: {
  name: string;
  contact: string;
  invitedByType: InvitedByType;
  invitedByCoachId: string | null;
  invitedByCustomerId: string | null;
  consumptionType: ConsumptionType;
  checkinDate: string;
}) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("record_walkin_checkin", {
    p_name: input.name,
    p_contact: input.contact,
    p_invited_by_type: input.invitedByType,
    p_invited_by_coach_id: input.invitedByCoachId,
    p_invited_by_customer_id: input.invitedByCustomerId,
    p_consumption_type: input.consumptionType,
    p_checkin_date: input.checkinDate,
  });

  if (error) {
    return { error: error.message };
  }

  return { success: true, name: input.name, balance: 0 };
}
