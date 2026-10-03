"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { canSeeFriendshipPass, getCurrentCoach, getCurrentUser } from "@/lib/auth";
import type { FriendshipPassSource } from "@/lib/types/database";

// Same soft-launch gate as the page itself — belt-and-braces in case a
// request ever reaches these actions directly.
async function requireFriendshipPassAdmin() {
  const user = await getCurrentUser();
  if (!user || !canSeeFriendshipPass(user.email)) return null;
  const coach = await getCurrentCoach();
  if (!coach || !coach.is_admin) return null;
  return coach;
}

export async function awardFriendshipPasses(
  customerId: string,
  source: FriendshipPassSource,
  count: number,
  reason: string,
  expiresAt?: string | null
) {
  const coach = await requireFriendshipPassAdmin();
  if (!coach) return { error: "Not authorized." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("award_friendship_passes", {
    p_customer_id: customerId,
    p_source: source,
    p_count: count,
    p_reason: reason,
    p_expires_at: expiresAt ?? null,
  });

  if (error) return { error: error.message };
  revalidatePath("/friendship-pass");
  return { success: true };
}

export async function voidFriendshipPass(passId: string, reason: string) {
  const coach = await requireFriendshipPassAdmin();
  if (!coach) return { error: "Not authorized." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("void_friendship_pass", {
    p_pass_id: passId,
    p_reason: reason,
  });

  if (error) return { error: error.message };
  revalidatePath("/friendship-pass");
  return { success: true };
}
