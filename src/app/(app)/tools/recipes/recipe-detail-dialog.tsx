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
import { Badge } from "@/components/ui/badge";
import type { ShakeRecipe } from "@/lib/types/database";
import { deleteRecipe, setPublicRequest, reviewPublicRequest } from "./actions";
import { RECIPE_COLOR_SWATCH } from "./colors";

const ROWS: { key: "base" | "side" | "shake" | "body" | "topping"; label: string }[] = [
  { key: "base", label: "Base" },
  { key: "side", label: "Side" },
  { key: "shake", label: "Shake" },
  { key: "body", label: "Body" },
  { key: "topping", label: "Topping" },
];

export function RecipeDetailDialog({
  recipe,
  currentCoachId,
  isSuperAdmin,
  onOpenChange,
  onEdit,
  onUpdated,
  onDeleted,
}: {
  recipe: ShakeRecipe | null;
  currentCoachId: string;
  isSuperAdmin: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit: (recipe: ShakeRecipe) => void;
  onUpdated: (recipe: ShakeRecipe) => void;
  onDeleted: (id: string) => void;
}) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSubmittingRequest, setIsSubmittingRequest] = useState(false);
  const [isReviewing, setIsReviewing] = useState(false);

  const isOwner = recipe !== null && recipe.created_by === currentCoachId;
  // Once a recipe is public, only the admin keeps write access to it — the
  // original creator's edit/delete rights end there (see the RLS policies).
  const canManage = recipe !== null && (isSuperAdmin || (isOwner && !recipe.is_public));
  const canRequestPublic = recipe !== null && isOwner && !isSuperAdmin && !recipe.is_public;
  const canReview = recipe !== null && isSuperAdmin && !recipe.is_public && recipe.public_requested;

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

  async function handleToggleRequest(requested: boolean) {
    if (!recipe) return;
    setIsSubmittingRequest(true);
    const result = await setPublicRequest(recipe.id, requested);
    setIsSubmittingRequest(false);

    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success(requested ? "Requested — waiting for admin approval." : "Request cancelled.");
    onUpdated(result.recipe!);
  }

  async function handleReview(approve: boolean) {
    if (!recipe) return;
    setIsReviewing(true);
    const result = await reviewPublicRequest(recipe.id, approve);
    setIsReviewing(false);

    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success(approve ? "Approved — now public." : "Rejected — stays private.");
    onUpdated(result.recipe!);
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

            <div className="flex flex-wrap gap-1.5">
              <Badge variant="secondary">
                {recipe.is_public
                  ? "Public"
                  : recipe.public_requested
                    ? "Pending public approval"
                    : "Only my club"}
              </Badge>
              {recipe.colors.map((color) => (
                <Badge key={color} variant="outline">
                  <span
                    className="size-2 rounded-full"
                    style={{ backgroundColor: RECIPE_COLOR_SWATCH[color] ?? "#999" }}
                  />
                  {color}
                </Badge>
              ))}
            </div>

            {canReview && (
              <div className="rounded-md border border-primary/30 bg-primary/5 p-3 text-sm">
                <p className="font-medium">This coach asked to share it publicly.</p>
                <div className="mt-2 flex gap-2">
                  <Button size="sm" disabled={isReviewing} onClick={() => handleReview(true)}>
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={isReviewing}
                    onClick={() => handleReview(false)}
                  >
                    Reject
                  </Button>
                </div>
              </div>
            )}

            <dl className="space-y-2 text-sm">
              {ROWS.map((row) => (
                <div key={row.key} className="flex gap-2">
                  <dt className="w-20 shrink-0 font-medium">{row.label}:</dt>
                  <dd className="text-muted-foreground">{recipe[row.key]}</dd>
                </div>
              ))}
            </dl>

            {(canManage || canRequestPublic) && (
              <DialogFooter>
                {canRequestPublic && (
                  <Button
                    variant="outline"
                    disabled={isSubmittingRequest}
                    onClick={() => handleToggleRequest(!recipe.public_requested)}
                  >
                    {recipe.public_requested ? "Cancel request" : "Share to Public"}
                  </Button>
                )}
                {canManage && (
                  <>
                    <Button variant="outline" onClick={() => onEdit(recipe)}>
                      Edit
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger render={<Button variant="destructive" />}>
                        Delete
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete {recipe.code}?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This removes &quot;{recipe.name_zh}&quot; from the library. This
                            can&apos;t be undone.
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
                  </>
                )}
              </DialogFooter>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
