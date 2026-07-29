"use client";

import { useMemo, useState } from "react";
import { Blender, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { ShakeRecipe } from "@/lib/types/database";
import { RecipeFormDialog } from "./recipe-form-dialog";
import { RecipeDetailDialog } from "./recipe-detail-dialog";
import { RECIPE_COLORS } from "./colors";

type FormState = { mode: "add" } | { mode: "edit"; recipe: ShakeRecipe };

export function RecipesClient({
  recipes: initialRecipes,
  currentCoachId,
  isSuperAdmin,
}: {
  recipes: ShakeRecipe[];
  currentCoachId: string;
  isSuperAdmin: boolean;
}) {
  const [recipes, setRecipes] = useState(initialRecipes);
  const [formState, setFormState] = useState<FormState | null>(null);
  const [selected, setSelected] = useState<ShakeRecipe | null>(null);
  const [search, setSearch] = useState("");
  const [activeColors, setActiveColors] = useState<string[]>([]);

  function toggleColorFilter(value: string) {
    setActiveColors((prev) =>
      prev.includes(value) ? prev.filter((c) => c !== value) : [...prev, value]
    );
  }

  function canManage(recipe: ShakeRecipe) {
    return isSuperAdmin || recipe.created_by === currentCoachId;
  }

  function upsertRecipe(recipe: ShakeRecipe) {
    setRecipes((prev) => {
      const exists = prev.some((r) => r.id === recipe.id);
      const next = exists ? prev.map((r) => (r.id === recipe.id ? recipe : r)) : [...prev, recipe];
      return next.sort((a, b) => a.code.localeCompare(b.code));
    });
  }

  // Ingredients stay plain text search across the recipe's fields — matches
  // "dragon fruit" against whatever wording each recipe used (Base/Side/
  // Shake/Body/Topping and both names) instead of needing a second tag list
  // kept in sync alongside the fixed color palette.
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return recipes.filter((r) => {
      const matchesSearch =
        q === "" ||
        [r.name_zh, r.name_en, r.base, r.side, r.shake, r.body, r.topping]
          .join(" ")
          .toLowerCase()
          .includes(q);
      const matchesColor = activeColors.length === 0 || activeColors.some((c) => r.colors.includes(c));
      return matchesSearch && matchesColor;
    });
  }, [recipes, search, activeColors]);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl">Shake Recipes</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {filtered.length} of {recipes.length} recipe{recipes.length === 1 ? "" : "s"}. Admin-only
            test page.
          </p>
        </div>
        <Button onClick={() => setFormState({ mode: "add" })}>
          <Plus /> Add recipe
        </Button>
      </div>

      <div className="mt-4 space-y-2">
        <div className="relative max-w-sm">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search ingredients or name (e.g. dragon fruit)"
            className="pl-8"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {RECIPE_COLORS.map((c) => {
            const active = activeColors.includes(c.value);
            return (
              <Badge
                key={c.value}
                variant={active ? "default" : "outline"}
                render={<button type="button" onClick={() => toggleColorFilter(c.value)} />}
                className={cn(!active && "text-foreground")}
              >
                <span className="size-2 rounded-full" style={{ backgroundColor: c.swatch }} />
                {c.value}
              </Badge>
            );
          })}
        </div>
      </div>

      {recipes.length === 0 ? (
        <p className="mt-8 text-sm text-muted-foreground">No recipes yet — add the first one.</p>
      ) : filtered.length === 0 ? (
        <p className="mt-8 text-sm text-muted-foreground">No recipes match that search/filter.</p>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((recipe) => (
            <Card
              key={recipe.id}
              className="cursor-pointer gap-0 overflow-hidden py-0 transition-colors hover:bg-accent/50"
              onClick={() => setSelected(recipe)}
            >
              <div className="flex aspect-square items-center justify-center bg-muted">
                {recipe.photo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={recipe.photo_url}
                    alt={recipe.name_en}
                    className="size-full object-cover"
                  />
                ) : (
                  <Blender className="size-8 text-muted-foreground" strokeWidth={1.5} />
                )}
              </div>
              <CardContent className="py-3">
                <p className="text-xs text-muted-foreground">{recipe.code}</p>
                <p className="font-medium">{recipe.name_zh}</p>
                <p className="text-sm text-muted-foreground">{recipe.name_en}</p>
                {recipe.colors.length > 0 && (
                  <div className="mt-1.5 flex gap-1">
                    {recipe.colors.map((color) => (
                      <span
                        key={color}
                        title={color}
                        className="size-2.5 rounded-full ring-1 ring-foreground/10"
                        style={{
                          backgroundColor:
                            RECIPE_COLORS.find((c) => c.value === color)?.swatch ?? "#999",
                        }}
                      />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {formState && (
        <RecipeFormDialog
          key={formState.mode === "edit" ? formState.recipe.id : "add"}
          mode={formState.mode}
          recipe={formState.mode === "edit" ? formState.recipe : undefined}
          open={formState !== null}
          onOpenChange={(open) => !open && setFormState(null)}
          onDone={upsertRecipe}
        />
      )}

      <RecipeDetailDialog
        recipe={selected}
        canManage={selected !== null && canManage(selected)}
        onOpenChange={(open) => !open && setSelected(null)}
        onEdit={(recipe) => {
          setSelected(null);
          setFormState({ mode: "edit", recipe });
        }}
        onDeleted={(id) => {
          setRecipes((prev) => prev.filter((r) => r.id !== id));
          setSelected(null);
        }}
      />
    </div>
  );
}
