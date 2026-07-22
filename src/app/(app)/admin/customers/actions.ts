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
  remark: string | null;
  isPjs: boolean;
  isHealthAmbassador: boolean;
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
    remark: input.remark,
    is_pjs: input.isPjs,
    is_health_ambassador: input.isHealthAmbassador,
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
      // consumption_balance is intentionally not updatable here — it can
      // only change via renewCustomer() (Renew dialog) or a check-in, both
      // of which keep an audit trail. Editing it directly here would bypass
      // that.
      invited_by_type: input.invitedByType,
      invited_by_coach_id: input.invitedByCoachId,
      invited_by_customer_id: input.invitedByCustomerId,
      coach_id: input.coachId,
      member_id: input.memberId,
      member_type: input.memberType,
      remark: input.remark,
      is_pjs: input.isPjs,
      is_health_ambassador: input.isHealthAmbassador,
    })
    .eq("id", id);

  if (error) return { error: error.message };

  revalidatePath("/admin/customers");
  return { success: true };
}

export async function renewCustomer(
  id: string,
  ncLevel: CustomerNcLevel,
  cupsAdded: number,
  reason: string | null = null
) {
  const coach = await getCurrentCoach();
  if (!coach || !coach.is_admin) {
    return { error: "Not authorized." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("renew_customer", {
    p_customer_id: id,
    p_nc_level: ncLevel,
    p_cups_added: cupsAdded,
    p_reason: reason,
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

// Undo a deactivation — e.g. a walk-in Ala Carte customer comes back to
// start a real package. Reactivating and editing keeps their existing
// record (and check-in history) instead of creating a duplicate.
export async function reactivateCustomer(id: string) {
  const coach = await getCurrentCoach();
  if (!coach || !coach.is_admin) {
    return { error: "Not authorized." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("customers").update({ active: true }).eq("id", id);

  if (error) return { error: error.message };

  revalidatePath("/admin/customers");
  return { success: true };
}

export interface CustomerMemberInput {
  name: string;
  contact: string | null;
  dob: string | null;
}

// A spouse/family member sharing this customer's consumption balance — they
// get their own name, contact and DOB so they can be found by name at
// check-in, but no separate balance of their own.
export async function addCustomerMember(customerId: string, input: CustomerMemberInput) {
  const coach = await getCurrentCoach();
  if (!coach || !coach.is_admin) {
    return { error: "Not authorized." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("customer_members")
    .insert({
      customer_id: customerId,
      name: input.name,
      contact: input.contact,
      dob: input.dob,
    })
    .select("id, customer_id, name, contact, dob, active")
    .single();

  if (error || !data) return { error: error?.message ?? "Could not add family member." };

  revalidatePath("/admin/customers");
  return { success: true, member: data };
}

// Soft delete, same reasoning as customers: checkins reference members, so
// "removing" one sets active = false instead of deleting the row.
export async function deactivateCustomerMember(id: string) {
  const coach = await getCurrentCoach();
  if (!coach || !coach.is_admin) {
    return { error: "Not authorized." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("customer_members")
    .update({ active: false })
    .eq("id", id);

  if (error) return { error: error.message };

  revalidatePath("/admin/customers");
  return { success: true };
}
