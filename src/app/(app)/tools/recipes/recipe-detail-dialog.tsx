"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import type { ShakeRecipe } from "@/lib/types/database";
import { deleteRecipe } from "./actions";

const ROWS: { key: "base" | "side" | "shake" | "body" | "topping"; label: string }[] = [
  { key: "base", label: "Base" },
  { key: "side", label: "Side" },
  { key: "shake", label: "Shake" },
  { key: "body", label: "Body" },
  { key: "topping", label: "Topping" },
];

export function RecipeDetailDialog({
  recipe,
  onOpenChange,
  onDeleted,
}: {
  recipe: ShakeRecipe | null;
  onOpenChange: (open: boolean) => void;
  onDeleted: (id: string) => void;
}) {
  const [isDeleting, setIsDeleting] = useState(false);

  async function handleDelete() {
    if (!recipe) return;
    setIsDeleting(true);
    const result = await deleteRecipe(recipe.id);
    setIsDeleting(false);

    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success(`Deleted ${recipe.code}.`);
    onDeleted(recipe.id);
  }

  return (
    <Dialog open={recipe !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
        {recipe && (
          <>
            <DialogHeader>
              <DialogTitle>
                {recipe.code} · {recipe.name_zh}
              </DialogTitle>
            </DialogHeader>

            {recipe.photo_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={recipe.photo_url}
                alt={recipe.name_en}
                className="aspect-square w-full rounded-lg object-cover"
              />
            )}

            <p className="text-sm text-muted-foreground">{recipe.name_en}</p>

            <dl className="space-y-2 text-sm">
              {ROWS.map((row) => (
                <div key={row.key} className="flex gap-2">
                  <dt className="w-20 shrink-0 font-medium">{row.label}:</dt>
                  <dd className="text-muted-foreground">{recipe[row.key]}</dd>
                </div>
              ))}
            </dl>

            <DialogFooter>
              <AlertDialog>
                <AlertDialogTrigger render={<Button variant="destructive" />}>
                  Delete
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete {recipe.code}?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This removes &quot;{recipe.name_zh}&quot; from the library. This can&apos;t
                      be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      variant="destructive"
                      disabled={isDeleting}
                      onClick={handleDelete}
                    >
                      {isDeleting ? "Deleting..." : "Delete"}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
