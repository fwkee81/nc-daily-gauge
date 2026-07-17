"use client";

import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { addProduct } from "./actions";

export function AddProductDialog({
  open,
  onOpenChange,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: (product: { id: string; name: string; vp: number }) => void;
}) {
  const [name, setName] = useState("");
  const [vp, setVp] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setName("");
    setVp("");
    setError(null);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const vpNum = Number(vp);
    if (!name.trim()) {
      setError("Enter a product name.");
      return;
    }
    if (!vpNum || vpNum <= 0) {
      setError("Enter a valid VP.");
      return;
    }

    setIsPending(true);
    const result = await addProduct(name.trim(), vpNum);
    setIsPending(false);

    if (result.error) {
      setError(result.error);
      toast.error(result.error);
      return;
    }

    toast.success(`Added ${result.product!.name}.`);
    onDone(result.product!);
    reset();
    onOpenChange(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Add a product</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <p className="rounded-md bg-destructive/10 p-2 text-sm text-destructive">{error}</p>
          )}

          <div className="space-y-1">
            <Label>Product name *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} required />
          </div>

          <div className="space-y-1">
            <Label>VP *</Label>
            <Input
              type="number"
              min={0}
              step="0.01"
              value={vp}
              onChange={(e) => setVp(e.target.value)}
              required
            />
          </div>

          <Button type="submit" disabled={isPending} className="w-full">
            {isPending ? "Adding..." : "Add product"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
