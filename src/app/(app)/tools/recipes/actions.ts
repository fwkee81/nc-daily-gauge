"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentCoach } from "@/lib/auth";
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
  colors: string[];
  isPublic: boolean;
}

export async function addRecipe(input: RecipeInput) {
  const coach = await getCurrentCoach();
  if (!coach || !coach.nc_club_id) return { error: "Not authorized." };

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
      colors: input.colors,
      is_public: input.isPublic,
      nc_club_id: coach.nc_club_id,
      created_by: coach.id,
    })
    .select("*")
    .single();

  if (error) return { error: error.message };

  revalidatePath("/tools/recipes");
  return { success: true, recipe: data as ShakeRecipe };
}

export async function updateRecipe(id: string, input: RecipeInput) {
  const coach = await getCurrentCoach();
  if (!coach) return { error: "Not authorized." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("shake_recipes")
    .update({
      name_zh: input.nameZh,
      name_en: input.nameEn,
      base: input.base,
      side: input.side,
      shake: input.shake,
      body: input.body,
      topping: input.topping,
      photo_url: input.photoUrl,
      colors: input.colors,
      is_public: input.isPublic,
    })
    .eq("id", id)
    .select("*");

  if (error) return { error: error.message };
  if (!data || data.length === 0) return { error: "You can only edit recipes you added." };

  revalidatePath("/tools/recipes");
  return { success: true, recipe: data[0] as ShakeRecipe };
}

export async function deleteRecipe(id: string) {
  const coach = await getCurrentCoach();
  if (!coach) return { error: "Not authorized." };

  const supabase = await createClient();
  const { data, error } = await supabase.from("shake_recipes").delete().eq("id", id).select("id");

  if (error) return { error: error.message };
  if (!data || data.length === 0) return { error: "You can only delete recipes you added." };

  revalidatePath("/tools/recipes");
  return { success: true };
}
