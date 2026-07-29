"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentCoach, getCurrentUser } from "@/lib/auth";
import { SUPER_ADMIN_EMAIL } from "@/lib/constants";
import type { ShakeRecipe } from "@/lib/types/database";

export interface RecipeInput {
  nameZh: string;
  nameEn: string;
  base: string;
  side: string;
  shake: string;
  body: string;
  topping: string;
  photoUrl: string | null;
}

async function requireSuperAdminCoach() {
  const user = await getCurrentUser();
  if (user?.email !== SUPER_ADMIN_EMAIL) return null;
  return getCurrentCoach();
}

export async function addRecipe(input: RecipeInput) {
  const coach = await requireSuperAdminCoach();
  if (!coach) return { error: "Not authorized." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("shake_recipes")
    .insert({
      name_zh: input.nameZh,
      name_en: input.nameEn,
      base: input.base,
      side: input.side,
      shake: input.shake,
      body: input.body,
      topping: input.topping,
      photo_url: input.photoUrl,
      created_by: coach.id,
    })
    .select("*")
    .single();

  if (error) return { error: error.message };

  revalidatePath("/tools/recipes");
  return { success: true, recipe: data as ShakeRecipe };
}

export async function deleteRecipe(id: string) {
  const coach = await requireSuperAdminCoach();
  if (!coach) return { error: "Not authorized." };

  const supabase = await createClient();
  const { error } = await supabase.from("shake_recipes").delete().eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/tools/recipes");
  return { success: true };
}
