"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Combobox, type ComboboxOption } from "@/components/combobox";
import { linkCustomerToSpouse } from "./actions";
import type { CustomerRow } from "./customers-client";

// Merges customer's account into whichever existing customer is picked here
// — from then on both share one balance. Distinct from "Add family member"
// on the customer form: that's for someone who never gets their own
// customers.id, this is for two people who each already have a full,
// independent profile (e.g. each opened their own 5-Day) and now want to
// combine once one of them runs out.
export function LinkSpouseDialog({
  customer,
  customers,
  open,
  onOpenChange,
  onDone,
}: {
  customer: CustomerRow;
  customers: CustomerRow[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
}) {
  const [targetId, setTargetId] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const options: ComboboxOption[] = useMemo(
    () =>
      customers
        .filter((c) => c.id !== customer.id && c.active)
        // A customer who is themselves linked to someone else can't be a
        // target — link to whoever holds that shared balance instead. The
        // RPC enforces this too; filtering here just keeps the picker clean.
        .filter((c) => !c.linked_to_customer_id)
        .map((c) => ({
          value: c.id,
          label: c.name,
          description: `${c.consumption_balance} left`,
        })),
    [customers, customer.id]
  );

  async function handleSubmit() {
    setError(null);
    if (!targetId) {
      setError("Choose who to link this account to.");
      return;
    }

    setIsPending(true);
    const result = await linkCustomerToSpouse(customer.id, targetId);
    setIsPending(false);

    if (result?.error) {
      setError(result.error);
      toast.error(result.error);
      return;
    }

    toast.success(`${customer.name} is now linked and shares a balance.`);
    onDone();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Link {customer.name} to another account</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {error && (
            <p className="rounded-md bg-destructive/10 p-2 text-sm text-destructive">{error}</p>
          )}

          <p className="text-sm text-muted-foreground">
            {customer.name}&apos;s current balance ({customer.consumption_balance}) will be merged
            into the account you pick, and {customer.name} will share that balance from now on.
            This cannot be undone without forfeiting {customer.name}&apos;s side of the balance —
            see Unlink.
          </p>

          <div className="space-y-1">
            <Label>Link to *</Label>
            <Combobox
              options={options}
              value={targetId}
              onChange={setTargetId}
              placeholder="Choose the account to share with"
              searchPlaceholder="Search customers..."
              emptyText="No eligible customers found."
            />
          </div>

          <Button onClick={handleSubmit} disabled={isPending} className="w-full">
            {isPending ? "Linking..." : "Link accounts"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
