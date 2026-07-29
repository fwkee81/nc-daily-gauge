// Fixed palette so every recipe's colors stay consistent and filterable —
// pick from here instead of free text, same reasoning as the ingredient
// fields staying plain text (color needs to be exact-match filterable,
// ingredients don't).
export const RECIPE_COLORS: { value: string; swatch: string }[] = [
  { value: "Red", swatch: "#ef4444" },
  { value: "Orange", swatch: "#f97316" },
  { value: "Yellow", swatch: "#eab308" },
  { value: "Green", swatch: "#22c55e" },
  { value: "Blue", swatch: "#3b82f6" },
  { value: "Purple", swatch: "#a855f7" },
  { value: "Pink", swatch: "#ec4899" },
  { value: "Brown", swatch: "#92400e" },
  { value: "White", swatch: "#f5f5f4" },
];

export const RECIPE_COLOR_SWATCH: Record<string, string> = Object.fromEntries(
  RECIPE_COLORS.map((c) => [c.value, c.swatch])
);
