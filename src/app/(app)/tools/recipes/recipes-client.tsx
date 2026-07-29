"use client";

import { useState } from "react";
import { Blender, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { ShakeRecipe } from "@/lib/types/database";
import { AddRecipeDialog } from "./add-recipe-dialog";
import { RecipeDetailDialog } from "./recipe-detail-dialog";

export function RecipesClient({ recipes: initialRecipes }: { recipes: ShakeRecipe[] }) {
  const [recipes, setRecipes] = useState(initialRecipes);
  const [addOpen, setAddOpen] = useState(false);
  const [selected, setSelected] = useState<ShakeRecipe | null>(null);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl">Shake Recipes</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {recipes.length} recipe{recipes.length === 1 ? "" : "s"} in the library. Admin-only
            test page.
          </p>
        </div>
        <Button onClick={() => setAddOpen(true)}>
          <Plus /> Add recipe
        </Button>
      </div>

      {recipes.length === 0 ? (
        <p className="mt-8 text-sm text-muted-foreground">No recipes yet — add the first one.</p>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {recipes.map((recipe) => (
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
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <AddRecipeDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        onDone={(recipe) =>
          setRecipes((prev) => [...prev, recipe].sort((a, b) => a.code.localeCompare(b.code)))
        }
      />

      <RecipeDetailDialog
        recipe={selected}
        onOpenChange={(open) => !open && setSelected(null)}
        onDeleted={(id) => {
          setRecipes((prev) => prev.filter((r) => r.id !== id));
          setSelected(null);
        }}
      />
    </div>
  );
}
