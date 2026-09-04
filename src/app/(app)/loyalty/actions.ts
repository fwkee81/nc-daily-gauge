"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentCoach } from "@/lib/auth";

export async function upsertLoyaltySettings(enabled: boolean, pointsPerCup: number) {
  const coach = await getCurrentCoach();
  if (!coach || !coach.is_admin) return { error: "Not authorized." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("upsert_loyalty_settings", {
    p_enabled: enabled,
    p_points_per_cup: pointsPerCup,
  });

  if (error) return { error: error.message };
  revalidatePath("/loyalty");
  return { success: true };
}

export async function awardLoyaltyPoints(
  customerId: string,
  earnRuleId: string | null,
  points: number | null,
  reason: string | null
) {
  const coach = await getCurrentCoach();
  if (!coach || !coach.is_admin) return { error: "Not authorized." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("award_loyalty_points", {
    p_customer_id: customerId,
    p_earn_rule_id: earnRuleId,
    p_points: points,
    p_reason: reason,
  });

  if (error) return { error: error.message };
  revalidatePath("/loyalty");
  return { success: true };
}

export async function redeemLoyaltyReward(customerId: string, rewardId: string) {
  const coach = await getCurrentCoach();
  if (!coach || !coach.is_admin) return { error: "Not authorized." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("redeem_loyalty_reward", {
    p_customer_id: customerId,
    p_reward_id: rewardId,
  });

  if (error) return { error: error.message };
  revalidatePath("/loyalty");
  return { success: true };
}

export async function voidLoyaltyRedemption(entryId: string, reason: string) {
  const coach = await getCurrentCoach();
  if (!coach || !coach.is_admin) return { error: "Not authorized." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("void_loyalty_redemption", {
    p_entry_id: entryId,
    p_reason: reason,
  });

  if (error) return { error: error.message };
  revalidatePath("/loyalty");
  return { success: true };
}

export async function createLoyaltyEarnRule(label: string, points: number) {
  const coach = await getCurrentCoach();
  if (!coach || !coach.is_admin || !coach.nc_club_id) return { error: "Not authorized." };

  const supabase = await createClient();
  const { data: last } = await supabase
    .from("loyalty_earn_rules")
    .select("sort_order")
    .eq("nc_club_id", coach.nc_club_id)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextSortOrder = (last?.sort_order ?? -1) + 1;

  const { error } = await supabase
    .from("loyalty_earn_rules")
    .insert({ nc_club_id: coach.nc_club_id, label, points, sort_order: nextSortOrder });

  if (error) return { error: error.message };
  revalidatePath("/loyalty");
  return { success: true };
}

// Swaps this rule's sort_order with its immediate neighbor in the
// club's current display order — a no-op (not an error) at either end
// of the list.
export async function moveLoyaltyEarnRule(id: string, direction: "up" | "down") {
  const coach = await getCurrentCoach();
  if (!coach || !coach.is_admin || !coach.nc_club_id) return { error: "Not authorized." };

  const supabase = await createClient();
  const { data: rules, error: fetchError } = await supabase
    .from("loyalty_earn_rules")
    .select("id, sort_order")
    .eq("nc_club_id", coach.nc_club_id)
    .order("sort_order")
    .order("created_at");
  if (fetchError) return { error: fetchError.message };

  const index = (rules ?? []).findIndex((r) => r.id === id);
  if (index === -1) return { error: "Rule not found." };
  const swapIndex = direction === "up" ? index - 1 : index + 1;
  if (swapIndex < 0 || swapIndex >= (rules?.length ?? 0)) return { success: true };

  const a = rules![index];
  const b = rules![swapIndex];
  const { error: err1 } = await supabase
    .from("loyalty_earn_rules")
    .update({ sort_order: b.sort_order })
    .eq("id", a.id);
  if (err1) return { error: err1.message };
  const { error: err2 } = await supabase
    .from("loyalty_earn_rules")
    .update({ sort_order: a.sort_order })
    .eq("id", b.id);
  if (err2) return { error: err2.message };

  revalidatePath("/loyalty");
  return { success: true };
}

export async function setLoyaltyEarnRuleActive(id: string, active: boolean) {
  const coach = await getCurrentCoach();
  if (!coach || !coach.is_admin) return { error: "Not authorized." };

  const supabase = await createClient();
  const { error } = await supabase.from("loyalty_earn_rules").update({ active }).eq("id", id);

  if (error) return { error: error.message };
  revalidatePath("/loyalty");
  return { success: true };
}

export async function updateLoyaltyEarnRule(id: string, label: string, points: number) {
  const coach = await getCurrentCoach();
  if (!coach || !coach.is_admin) return { error: "Not authorized." };

  const supabase = await createClient();
  const { error } = await supabase.from("loyalty_earn_rules").update({ label, points }).eq("id", id);

  if (error) return { error: error.message };
  revalidatePath("/loyalty");
  return { success: true };
}

// A rule already used to award points can't be deleted — loyalty_points_
// ledger.earn_rule_id references it with no cascade, so Postgres raises a
// foreign key violation (23503) rather than silently orphaning history.
export async function deleteLoyaltyEarnRule(id: string) {
  const coach = await getCurrentCoach();
  if (!coach || !coach.is_admin) return { error: "Not authorized." };

  const supabase = await createClient();
  const { error } = await supabase.from("loyalty_earn_rules").delete().eq("id", id);

  if (error) {
    if (error.code === "23503") {
      return { error: "Can't delete — it's already been used to award points. Turn it off instead." };
    }
    return { error: error.message };
  }
  revalidatePath("/loyalty");
  return { success: true };
}

export async function createLoyaltyReward(name: string, pointsCost: number) {
  const coach = await getCurrentCoach();
  if (!coach || !coach.is_admin || !coach.nc_club_id) return { error: "Not authorized." };

  const supabase = await createClient();
  const { data: last } = await supabase
    .from("loyalty_rewards")
    .select("sort_order")
    .eq("nc_club_id", coach.nc_club_id)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextSortOrder = (last?.sort_order ?? -1) + 1;

  const { error } = await supabase
    .from("loyalty_rewards")
    .insert({ nc_club_id: coach.nc_club_id, name, points_cost: pointsCost, sort_order: nextSortOrder });

  if (error) return { error: error.message };
  revalidatePath("/loyalty");
  return { success: true };
}

// Same reorder logic as moveLoyaltyEarnRule, for the Rewards catalog.
export async function moveLoyaltyReward(id: string, direction: "up" | "down") {
  const coach = await getCurrentCoach();
  if (!coach || !coach.is_admin || !coach.nc_club_id) return { error: "Not authorized." };

  const supabase = await createClient();
  const { data: rewards, error: fetchError } = await supabase
    .from("loyalty_rewards")
    .select("id, sort_order")
    .eq("nc_club_id", coach.nc_club_id)
    .order("sort_order")
    .order("created_at");
  if (fetchError) return { error: fetchError.message };

  const index = (rewards ?? []).findIndex((r) => r.id === id);
  if (index === -1) return { error: "Reward not found." };
  const swapIndex = direction === "up" ? index - 1 : index + 1;
  if (swapIndex < 0 || swapIndex >= (rewards?.length ?? 0)) return { success: true };

  const a = rewards![index];
  const b = rewards![swapIndex];
  const { error: err1 } = await supabase
    .from("loyalty_rewards")
    .update({ sort_order: b.sort_order })
    .eq("id", a.id);
  if (err1) return { error: err1.message };
  const { error: err2 } = await supabase
    .from("loyalty_rewards")
    .update({ sort_order: a.sort_order })
    .eq("id", b.id);
  if (err2) return { error: err2.message };

  revalidatePath("/loyalty");
  return { success: true };
}

export async function setLoyaltyRewardActive(id: string, active: boolean) {
  const coach = await getCurrentCoach();
  if (!coach || !coach.is_admin) return { error: "Not authorized." };

  const supabase = await createClient();
  const { error } = await supabase.from("loyalty_rewards").update({ active }).eq("id", id);

  if (error) return { error: error.message };
  revalidatePath("/loyalty");
  return { success: true };
}

export async function updateLoyaltyReward(id: string, name: string, pointsCost: number) {
  const coach = await getCurrentCoach();
  if (!coach || !coach.is_admin) return { error: "Not authorized." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("loyalty_rewards")
    .update({ name, points_cost: pointsCost })
    .eq("id", id);

  if (error) return { error: error.message };
  revalidatePath("/loyalty");
  return { success: true };
}

// Same reasoning as deleteLoyaltyEarnRule — blocked by a foreign key
// violation (23503) if it's already been redeemed.
export async function deleteLoyaltyReward(id: string) {
  const coach = await getCurrentCoach();
  if (!coach || !coach.is_admin) return { error: "Not authorized." };

  const supabase = await createClient();
  const { error } = await supabase.from("loyalty_rewards").delete().eq("id", id);

  if (error) {
    if (error.code === "23503") {
      return { error: "Can't delete — it's already been used for a redemption. Turn it off instead." };
    }
    return { error: error.message };
  }
  revalidatePath("/loyalty");
  return { success: true };
}
