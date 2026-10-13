"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// A server action (rather than a plain Link) forces a real round-trip back
// through the server component, so it actually re-checks approval status
// instead of possibly serving a cached render of the same route.
export async function recheckApproval() {
  redirect("/pending-approval");
}

// coaches.auth_user_id is unique, so a rejected coach can never insert a
// second row through onboarding — re-flipping active back to true on their
// existing row is their only way to try again. approved itself is still
// protected by coaches_update_self's with check, so this only ever lands
// them back in "pending", never straight into the app — an admin still has
// to actually approve them.
export async function retryRegistration() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  await supabase.from("coaches").update({ active: true }).eq("auth_user_id", user.id);
  redirect("/pending-approval");
}
