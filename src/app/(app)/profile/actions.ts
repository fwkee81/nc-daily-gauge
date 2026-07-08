"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function updateProfile(input: { name: string; contact: string; dob: string }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Not signed in." };
  }

  const { error } = await supabase
    .from("coaches")
    .update({ name: input.name, contact: input.contact, dob: input.dob })
    .eq("auth_user_id", user.id);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/profile");
  return { success: true };
}
