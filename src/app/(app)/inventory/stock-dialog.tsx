"use client";

import { useState, type FormEvent } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Combobox, type ComboboxOption } from "@/components/combobox";
import type { InventoryDirection } from "@/lib/types/database";
import { recordInventoryBatch } from "./actions";

interface ProductOption {
  id: string;
  name: string;
  vp: number;
}

interface CustomerOption {
  id: string;
  name: string;
}

interface Line {
  key: string;
  productId: string | null;
  quantity: string;
}

const NONE_CUSTOMER = "__none__";

function emptyLine(): Line {
  return { key: crypto.randomUUID(), productId: null, quantity: "1" };
}

export function StockDialog({
  direction,
  open,
  onOpenChange,
  products,
  customers,
  onDone,
}: {
  direction: InventoryDirection;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  products: ProductOption[];
  customers: CustomerOption[];
  onDone: () => void;
}) {
  const todayStr = format(new Date(), "yyyy-MM-dd");
  const [txnDate, setTxnDate] = useState(todayStr);
  const [customerId, setCustomerId] = useState<string>(NONE_CUSTOMER);
  const [remark, setRemark] = useState("");
  const [lines, setLines] = useState<Line[]>([emptyLine()]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const productOptions: ComboboxOption[] = products.map((p) => ({
    value: p.id,
    label: p.name,
    description: `${p.vp} VP`,
  }));
  const customerOptions: ComboboxOption[] = [
    { value: NONE_CUSTOMER, label: "None" },
    ...customers.map((c) => ({ value: c.id, label: c.name })),
  ];

  function reset() {
    setTxnDate(todayStr);
    setCustomerId(NONE_CUSTOMER);
    setRemark("");
    setLines([emptyLine()]);
    setError(null);
  }

  function updateLine(key: string, patch: Partial<Line>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  function addLine() {
    setLines((prev) => [...prev, emptyLine()]);
  }

  function removeLine(key: string) {
    setLines((prev) => (prev.length > 1 ? prev.filter((l) => l.key !== key) : prev));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const parsedLines: { productId: string; quantity: number }[] = [];
    for (const line of lines) {
      if (!line.productId) continue;
      const qty = Number(line.quantity);
      if (!qty || qty <= 0) {
        setError("Every product line needs a valid quantity.");
        return;
      }
      parsedLines.push({ productId: line.productId, quantity: qty });
    }
    if (parsedLines.length === 0) {
      setError("Add at least one product.");
      return;
    }

    setSubmitting(true);
    const result = await recordInventoryBatch({
      direction,
      txnDate,
      customerId: customerId === NONE_CUSTOMER ? null : customerId,
      remark: remark.trim() || null,
      lines: parsedLines,
    });
    setSubmitting(false);

    if (result.error) {
      setError(result.error);
      toast.error(result.error);
      return;
    }

    toast.success(
      `Recorded ${parsedLines.length} product${parsedLines.length > 1 ? "s" : ""} stock ${direction}.`
    );
    reset();
    onOpenChange(false);
    onDone();
  }

  const title = direction === "in" ? "Stock in" : "Stock out";
  const customerHint =
    direction === "in"
      ? "Leave as None for a restock delivery. Set this if a customer is returning a product."
      : "Leave as None for your own use. Set this if you're selling or lending to a customer.";

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <p className="rounded-md bg-destructive/10 p-2 text-sm text-destructive">{error}</p>
          )}

          <div className="space-y-1">
            <Label>Date</Label>
            <Input
              type="date"
              max={todayStr}
              value={txnDate}
              onChange={(e) => setTxnDate(e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <Label>Customer (optional)</Label>
            <Combobox
              options={customerOptions}
              value={customerId}
              onChange={setCustomerId}
              placeholder="None"
              searchPlaceholder="Search customers..."
            />
            <p className="text-xs text-muted-foreground">{customerHint}</p>
          </div>

          <div className="space-y-2">
            <Label>Products</Label>
            {lines.map((line) => (
              <div key={line.key} className="flex items-start gap-2">
                <div className="flex-1">
                  <Combobox
                    options={productOptions}
                    value={line.productId}
                    onChange={(v) => updateLine(line.key, { productId: v })}
                    placeholder="Select product..."
                    searchPlaceholder="Search products..."
                  />
                </div>
                <Input
                  type="number"
                  min={1}
                  className="w-20"
                  value={line.quantity}
                  onChange={(e) => updateLine(line.key, { quantity: e.target.value })}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={lines.length === 1}
                  onClick={() => removeLine(line.key)}
                >
                  <X className="size-4" />
                </Button>
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" className="gap-1" onClick={addLine}>
              <Plus className="size-4" /> Add another product
            </Button>
          </div>

          <div className="space-y-1">
            <Label>Remark (optional)</Label>
            <Textarea value={remark} onChange={(e) => setRemark(e.target.value)} rows={2} />
          </div>

          <Button type="submit" disabled={submitting} className="w-full">
            {submitting ? "Recording..." : title}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
