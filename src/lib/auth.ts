import { createClient } from "@/lib/supabase/server";
import type { Coach } from "@/lib/types/database";

export async function getCurrentUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

// Friendship Pass is being soft-launched to one person before other coaches
// get it — gated here by email (not a per-club setting, not RLS) so lifting
// the restriction later is just deleting this check, no migration needed.
const FRIENDSHIP_PASS_BETA_EMAILS = ["fwkee81@gmail.com"];

export function canSeeFriendshipPass(email: string | null | undefined): boolean {
  return !!email && FRIENDSHIP_PASS_BETA_EMAILS.includes(email);
}

export async function getCurrentCoach(): Promise<Coach | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("coaches")
    .select("*")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  return (data as Coach | null) ?? null;
}
