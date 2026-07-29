"use client";

import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import type { ShakeRecipe } from "@/lib/types/database";
import { addRecipe, updateRecipe } from "./actions";
import { RECIPE_COLORS } from "./colors";

const FIELDS: { key: "base" | "side" | "shake" | "body" | "topping"; label: string; placeholder: string }[] = [
  { key: "base", label: "Base", placeholder: "e.g. Orange + Sweet Potato Cube" },
  { key: "side", label: "Side", placeholder: "e.g. Biji Selasih + Butterfly Pea Juice" },
  { key: "shake", label: "Shake", placeholder: "e.g. Banana x2 + Cookies x1" },
  { key: "body", label: "Body", placeholder: "e.g. Blended Sweet Potato" },
  { key: "topping", label: "Topping", placeholder: "e.g. Muesli + Biscuit" },
];

const EMPTY = { nameZh: "", nameEn: "", base: "", side: "", shake: "", body: "", topping: "" };

export function RecipeFormDialog({
  mode,
  recipe,
  open,
  onOpenChange,
  onDone,
}: {
  mode: "add" | "edit";
  recipe?: ShakeRecipe;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: (recipe: ShakeRecipe) => void;
}) {
  const [fields, setFields] = useState(
    recipe
      ? {
          nameZh: recipe.name_zh,
          nameEn: recipe.name_en,
          base: recipe.base,
          side: recipe.side,
          shake: recipe.shake,
          body: recipe.body,
          topping: recipe.topping,
        }
      : EMPTY
  );
  const [colors, setColors] = useState<string[]>(recipe?.colors ?? []);
  const [isPublic, setIsPublic] = useState(recipe?.is_public ?? true);
  const [photo, setPhoto] = useState<File | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleColor(value: string) {
    setColors((prev) => (prev.includes(value) ? prev.filter((c) => c !== value) : [...prev, value]));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!fields.nameZh.trim() || !fields.nameEn.trim()) {
      setError("Enter both the Chinese and English name.");
      return;
    }
    for (const f of FIELDS) {
      if (!fields[f.key].trim()) {
        setError(`Enter ${f.label}.`);
        return;
      }
    }

    setIsPending(true);

    let photoUrl = recipe?.photo_url ?? null;
    if (photo) {
      const supabase = createClient();
      const path = `${crypto.randomUUID()}-${photo.name}`;
      const { error: uploadError } = await supabase.storage
        .from("recipe-photos")
        .upload(path, photo);
      if (uploadError) {
        setIsPending(false);
        setError(uploadError.message);
        toast.error(uploadError.message);
        return;
      }
      photoUrl = supabase.storage.from("recipe-photos").getPublicUrl(path).data.publicUrl;
    }

    const payload = {
      nameZh: fields.nameZh.trim(),
      nameEn: fields.nameEn.trim(),
      base: fields.base.trim(),
      side: fields.side.trim(),
      shake: fields.shake.trim(),
      body: fields.body.trim(),
      topping: fields.topping.trim(),
      photoUrl,
      colors,
      isPublic,
    };
    const result = mode === "add" ? await addRecipe(payload) : await updateRecipe(recipe!.id, payload);
    setIsPending(false);

    if (result.error) {
      setError(result.error);
      toast.error(result.error);
      return;
    }

    toast.success(mode === "add" ? `Added ${result.recipe!.code}.` : `Saved ${result.recipe!.code}.`);
    onDone(result.recipe!);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{mode === "add" ? "Add a recipe" : `Edit ${recipe?.code}`}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <p className="rounded-md bg-destructive/10 p-2 text-sm text-destructive">{error}</p>
          )}

          <div className="space-y-1">
            <Label>Photo{mode === "edit" && " (leave empty to keep the current one)"}</Label>
            <Input
              type="file"
              accept="image/*"
              onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
            />
          </div>

          <div className="space-y-1">
            <Label>Colors</Label>
            <div className="flex flex-wrap gap-1.5">
              {RECIPE_COLORS.map((c) => {
                const active = colors.includes(c.value);
                return (
                  <Badge
                    key={c.value}
                    variant={active ? "default" : "outline"}
                    render={<button type="button" onClick={() => toggleColor(c.value)} />}
                    className={cn(!active && "text-foreground")}
                  >
                    <span
                      className="size-2 rounded-full"
                      style={{ backgroundColor: c.swatch }}
                    />
                    {c.value}
                  </Badge>
                );
              })}
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <Switch checked={isPublic} onCheckedChange={setIsPublic} />
            {isPublic ? "Public — visible to every club" : "Only my club can see this"}
          </label>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Name (中文) *</Label>
              <Input
                value={fields.nameZh}
                onChange={(e) => setFields((f) => ({ ...f, nameZh: e.target.value }))}
                required
              />
            </div>
            <div className="space-y-1">
              <Label>Name (English) *</Label>
              <Input
                value={fields.nameEn}
                onChange={(e) => setFields((f) => ({ ...f, nameEn: e.target.value }))}
                required
              />
            </div>
          </div>

          {FIELDS.map((f) => (
            <div key={f.key} className="space-y-1">
              <Label>{f.label} *</Label>
              <Input
                value={fields[f.key]}
                placeholder={f.placeholder}
                onChange={(e) => setFields((prev) => ({ ...prev, [f.key]: e.target.value }))}
                required
              />
            </div>
          ))}

          <Button type="submit" disabled={isPending} className="w-full">
            {isPending ? "Saving..." : mode === "add" ? "Add recipe" : "Save changes"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
