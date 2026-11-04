"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { SUPER_ADMIN_EMAIL } from "@/lib/constants";
import type { HolidayThemeSlug } from "@/lib/holiday-themes";

// RLS (is_super_admin() on every write policy) is the real gate — this check
// just gives a clean error message instead of a silent "0 rows updated".
export async function updateHolidayTheme(
  slug: HolidayThemeSlug,
  input: { startDate: string; endDate: string; enabled: boolean }
) {
  const user = await getCurrentUser();
  if (user?.email !== SUPER_ADMIN_EMAIL) return { error: "Only the super admin can edit holiday themes." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("holiday_themes")
    .upsert(
      { slug, start_date: input.startDate, end_date: input.endDate, enabled: input.enabled },
      { onConflict: "slug" }
    );

  if (error) return { error: error.message };

  revalidatePath("/admin/holiday-themes");
  return { success: true };
}
