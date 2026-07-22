"use client";

import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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

const CUSTOM = "Custom" as const;
type LevelOption = CustomerNcLevel | typeof CUSTOM;

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
  const [levelOption, setLevelOption] = useState<LevelOption>(customer.nc_level);
  const [cupsAdded, setCupsAdded] = useState(String(NC_LEVEL_CUPS[customer.nc_level]));
  const [reason, setReason] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleLevelChange(option: LevelOption) {
    setLevelOption(option);
    setCupsAdded(option === CUSTOM ? "" : String(NC_LEVEL_CUPS[option]));
    if (option !== CUSTOM) setReason("");
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const cups = Number(cupsAdded);
    if (!cups || cups <= 0) {
      setError("Cups to add must be a positive number.");
      return;
    }
    if (levelOption === CUSTOM && !reason.trim()) {
      setError("Please enter a reason for this custom renewal.");
      return;
    }

    // "Custom" isn't a real NC level — it just unlocks manual cup entry.
    // The customer's actual package level stays whatever it already was.
    const ncLevel = levelOption === CUSTOM ? customer.nc_level : levelOption;

    setIsPending(true);
    const result = await renewCustomer(
      customer.id,
      ncLevel,
      cups,
      levelOption === CUSTOM ? reason.trim() : null
    );
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
            <Select value={levelOption} onValueChange={(v) => handleLevelChange(v as LevelOption)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CUSTOMER_NC_LEVELS.map((l) => (
                  <SelectItem key={l} value={l}>
                    {l}
                  </SelectItem>
                ))}
                <SelectItem value={CUSTOM}>Custom</SelectItem>
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
              placeholder={levelOption === CUSTOM ? "Enter cups manually" : undefined}
              required
            />
          </div>

          {levelOption === CUSTOM && (
            <div className="space-y-1">
              <Label>Reason *</Label>
              <Textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Why this custom cup count..."
                rows={2}
                required
              />
            </div>
          )}

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
