"use server";

import { createClient } from "@/lib/supabase/server";
import type { ConsumptionType } from "@/lib/types/database";

export async function submitCheckin(
  customerId: string,
  cups: number,
  consumptionType: ConsumptionType,
  checkinDate: string
) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("record_checkin", {
    p_customer_id: customerId,
    p_cups: cups,
    p_consumption_type: consumptionType,
    p_checkin_date: checkinDate,
  });

  if (error) {
    return { error: error.message };
  }

  const { data: customer, error: customerError } = await supabase
    .from("customers")
    .select("name, consumption_balance")
    .eq("id", customerId)
    .single();

  if (customerError || !customer) {
    return { error: customerError?.message ?? "Check-in recorded but could not load balance." };
  }

  return { success: true, checkin: data, name: customer.name, balance: customer.consumption_balance };
}
