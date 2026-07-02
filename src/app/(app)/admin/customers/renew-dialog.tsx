"use client";

import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CUSTOMER_NC_LEVELS, NC_LEVEL_CUPS } from "@/lib/constants";
import type { CustomerNcLevel } from "@/lib/types/database";
import { renewCustomer } from "./actions";
import type { CustomerRow } from "./customers-client";

export function RenewDialog({
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
  const [ncLevel, setNcLevel] = useState<CustomerNcLevel>(customer.nc_level);
  const [cupsAdded, setCupsAdded] = useState(String(NC_LEVEL_CUPS[customer.nc_level]));
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleLevelChange(level: CustomerNcLevel) {
    setNcLevel(level);
    setCupsAdded(String(NC_LEVEL_CUPS[level]));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const cups = Number(cupsAdded);
    if (!cups || cups <= 0) {
      setError("Cups to add must be a positive number.");
      return;
    }

    setIsPending(true);
    const result = await renewCustomer(customer.id, ncLevel, cups);
    setIsPending(false);

    if (result?.error) {
      setError(result.error);
      toast.error(result.error);
      return;
    }

    toast.success(`Renewed ${customer.name}: +${cups} cups.`);
    onDone();
  }

  const newBalance = customer.consumption_balance + (Number(cupsAdded) || 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Renew {customer.name}&apos;s NC card</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <p className="rounded-md bg-destructive/10 p-2 text-sm text-destructive">{error}</p>
          )}

          <div className="space-y-1">
            <Label>NC Level</Label>
            <Select value={ncLevel} onValueChange={(v) => handleLevelChange(v as CustomerNcLevel)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CUSTOMER_NC_LEVELS.map((l) => (
                  <SelectItem key={l} value={l}>
                    {l}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label>Cups to add</Label>
            <Input
              type="number"
              min={1}
              value={cupsAdded}
              onChange={(e) => setCupsAdded(e.target.value)}
              required
            />
          </div>

          <p className="text-sm text-muted-foreground">
            Balance: {customer.consumption_balance} → <span className="font-medium text-foreground">{newBalance}</span>
          </p>

          <Button type="submit" disabled={isPending} className="w-full">
            {isPending ? "Renewing..." : "Renew"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
