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
      // only change via renewCustomer() (Renew dialog), correctCustomerBalance()
      // (Correct Balance dialog), or a check-in, all of which keep an audit
      // trail. Editing it directly here would bypass that.
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

// Directly sets consumption_balance — for fixing a wrong starting balance,
// not a package purchase. Kept separate from renewCustomer() so it never
// shows up as a "renewal" on the Daily Report ledger / Coach's Cup / NC
// Metrics.
export async function correctCustomerBalance(id: string, newBalance: number, reason: string) {
  const coach = await getCurrentCoach();
  if (!coach || !coach.is_admin) {
    return { error: "Not authorized." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("correct_customer_balance", {
    p_customer_id: id,
    p_new_balance: newBalance,
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

// customer_members (typed name/contact/dob for a family member with no
// profile of their own) is no longer created from the admin UI — the
// Family / shared members section now links two full customer profiles
// instead (see linkCustomerToSpouse/unlinkCustomer above). The table and
// its checkin-time lookups are untouched, so any existing customer_members
// rows keep working.

// Merges customerId's account into linkedToCustomerId's — from then on,
// check-ins for either draw from one shared balance. Any balance customerId
// still had is folded into the target (not frozen) and their nc_level is
// synced to match. Unlike addCustomerMember, both stay full customer
// records with their own id, so both keep their own wellness report.
export async function linkCustomerToSpouse(customerId: string, linkedToCustomerId: string) {
  const coach = await getCurrentCoach();
  if (!coach || !coach.is_admin) {
    return { error: "Not authorized." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("link_customer_to_spouse", {
    p_customer_id: customerId,
    p_linked_to_customer_id: linkedToCustomerId,
  });

  if (error) return { error: error.message };

  revalidatePath("/admin/customers");
  return { success: true };
}

// Reverses a link. The unlinked account's balance is forfeited (reset to 0)
// rather than split back out of the shared pool — see unlink_customer() in
// the schema for why.
export async function unlinkCustomer(customerId: string) {
  const coach = await getCurrentCoach();
  if (!coach || !coach.is_admin) {
    return { error: "Not authorized." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("unlink_customer", {
    p_customer_id: customerId,
  });

  if (error) return { error: error.message };

  revalidatePath("/admin/customers");
  return { success: true };
}

// True duplicate merge, not a shared-balance link — duplicateCustomerId's
// check-ins, renewals, and balance move to keepCustomerId, then
// duplicateCustomerId is deactivated. Use this when the same real person
// somehow ended up with two profiles (most often an Ala Carte walk-in
// re-created instead of reused).
export async function mergeCustomer(duplicateCustomerId: string, keepCustomerId: string) {
  const coach = await getCurrentCoach();
  if (!coach || !coach.is_admin) {
    return { error: "Not authorized." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("merge_customers", {
    p_duplicate_customer_id: duplicateCustomerId,
    p_keep_customer_id: keepCustomerId,
  });

  if (error) return { error: error.message };

  revalidatePath("/admin/customers");
  return { success: true };
}
