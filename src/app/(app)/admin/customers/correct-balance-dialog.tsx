"use client";

import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { correctCustomerBalance } from "./actions";
import type { CustomerRow } from "./customers-client";

// Distinct from RenewDialog on purpose — this isn't a package purchase, it's
// fixing a mistake (e.g. wrong starting balance key'd in at sign-up).
// Requires a reason and is logged separately (customer_balance_corrections)
// so it never gets counted as a real renewal anywhere in reporting.
export function CorrectBalanceDialog({
  customer,
  open,
  onOpenChange,
  onDone,
}: {
  customer: CustomerRow;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
}) {
  const [newBalance, setNewBalance] = useState(String(customer.consumption_balance));
  const [reason, setReason] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const balance = Number(newBalance);
    if (!Number.isInteger(balance) || balance < 0) {
      setError("Balance must be a whole number, 0 or more.");
      return;
    }
    if (!reason.trim()) {
      setError("Please enter a reason for this correction.");
      return;
    }

    setIsPending(true);
    const result = await correctCustomerBalance(customer.id, balance, reason.trim());
    setIsPending(false);

    if (result?.error) {
      setError(result.error);
      toast.error(result.error);
      return;
    }

    toast.success(`Balance corrected: ${customer.consumption_balance} → ${balance}.`);
    onDone();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Correct {customer.name}&apos;s balance</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <p className="rounded-md bg-destructive/10 p-2 text-sm text-destructive">{error}</p>
          )}

          <p className="text-sm text-muted-foreground">
            Current balance:{" "}
            <span className="font-medium text-foreground">{customer.consumption_balance}</span>
          </p>

          <div className="space-y-1">
            <Label>New Balance</Label>
            <Input
              type="number"
              min={0}
              value={newBalance}
              onChange={(e) => setNewBalance(e.target.value)}
              required
            />
          </div>

          <div className="space-y-1">
            <Label>Reason *</Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. entered wrong starting balance at sign-up"
              rows={2}
              required
            />
          </div>

          <Button type="submit" disabled={isPending} className="w-full">
            {isPending ? "Saving..." : "Correct Balance"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
