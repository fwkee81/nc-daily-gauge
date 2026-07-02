import { createClient } from "@/lib/supabase/server";
import type { Coach } from "@/lib/types/database";

export async function getCurrentUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
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
