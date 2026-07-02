"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentCoach } from "@/lib/auth";
import type {
  CustomerGender,
  CustomerNcLevel,
  InvitedByType,
  MemberType,
} from "@/lib/types/database";

export interface CustomerFormInput {
  name: string;
  gender: CustomerGender;
  contact: string;
  dob: string;
  ageOverride: number | null;
  ncLevel: CustomerNcLevel;
  consumptionBalance: number;
  invitedByType: InvitedByType;
  invitedByCoachId: string | null;
  invitedByCustomerId: string | null;
  coachId: string | null;
  memberId: string | null;
  memberType: MemberType | null;
}

export async function createCustomer(input: CustomerFormInput) {
  const coach = await getCurrentCoach();
  if (!coach || !coach.is_admin || !coach.nc_club_id) {
    return { error: "Not authorized." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("customers").insert({
    nc_club_id: coach.nc_club_id,
    name: input.name,
    gender: input.gender,
    contact: input.contact,
    dob: input.dob,
    age_override: input.ageOverride,
    nc_level: input.ncLevel,
    consumption_balance: input.consumptionBalance,
    invited_by_type: input.invitedByType,
    invited_by_coach_id: input.invitedByCoachId,
    invited_by_customer_id: input.invitedByCustomerId,
    coach_id: input.coachId,
    member_id: input.memberId,
    member_type: input.memberType,
    created_by: coach.id,
  });

  if (error) return { error: error.message };

  revalidatePath("/admin/customers");
  return { success: true };
}

export async function updateCustomer(id: string, input: CustomerFormInput) {
  const coach = await getCurrentCoach();
  if (!coach || !coach.is_admin) {
    return { error: "Not authorized." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("customers")
    .update({
      name: input.name,
      gender: input.gender,
      contact: input.contact,
      dob: input.dob,
      age_override: input.ageOverride,
      nc_level: input.ncLevel,
      consumption_balance: input.consumptionBalance,
      invited_by_type: input.invitedByType,
      invited_by_coach_id: input.invitedByCoachId,
      invited_by_customer_id: input.invitedByCustomerId,
      coach_id: input.coachId,
      member_id: input.memberId,
      member_type: input.memberType,
    })
    .eq("id", id);

  if (error) return { error: error.message };

  revalidatePath("/admin/customers");
  return { success: true };
}

export async function renewCustomer(id: string, ncLevel: CustomerNcLevel, cupsAdded: number) {
  const coach = await getCurrentCoach();
  if (!coach || !coach.is_admin) {
    return { error: "Not authorized." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("renew_customer", {
    p_customer_id: id,
    p_nc_level: ncLevel,
    p_cups_added: cupsAdded,
  });

  if (error) return { error: error.message };

  revalidatePath("/admin/customers");
  return { success: true };
}

// Soft delete: checkins reference customers, so "removing" a customer sets
// active = false instead of deleting the row. This keeps historical reports
// (Daily Report, NC Metrics) intact and hides them from check-in search.
export async function deactivateCustomer(id: string) {
  const coach = await getCurrentCoach();
  if (!coach || !coach.is_admin) {
    return { error: "Not authorized." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("customers").update({ active: false }).eq("id", id);

  if (error) return { error: error.message };

  revalidatePath("/admin/customers");
  return { success: true };
}
