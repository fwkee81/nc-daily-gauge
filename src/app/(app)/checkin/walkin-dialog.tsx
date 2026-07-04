"use client";

import { useMemo, useState, type FormEvent } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Combobox, type ComboboxOption } from "@/components/combobox";
import { CONSUMPTION_TYPES } from "@/lib/constants";
import type { ConsumptionType } from "@/lib/types/database";
import { submitWalkinCheckin } from "./actions";

const PLUGIN_VALUE = "plugin";

interface CoachOption {
  id: string;
  name: string;
}

interface CustomerOption {
  id: string;
  name: string;
}

export function WalkinDialog({
  open,
  onOpenChange,
  coaches,
  customers,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  coaches: CoachOption[];
  customers: CustomerOption[];
  onDone: (result: { name: string; balance: number }) => void;
}) {
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [invitedBy, setInvitedBy] = useState<string>(PLUGIN_VALUE);
  const [consumptionType, setConsumptionType] = useState<ConsumptionType>(CONSUMPTION_TYPES[0]);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const invitedByOptions: ComboboxOption[] = useMemo(() => {
    const options: ComboboxOption[] = [{ value: PLUGIN_VALUE, label: "Plug-in" }];
    for (const c of coaches) {
      options.push({ value: `coach:${c.id}`, label: c.name, description: "Coach" });
    }
    for (const c of customers) {
      options.push({ value: `customer:${c.id}`, label: c.name, description: "Customer" });
    }
    return options;
  }, [coaches, customers]);

  function reset() {
    setName("");
    setContact("");
    setInvitedBy(PLUGIN_VALUE);
    setConsumptionType(CONSUMPTION_TYPES[0]);
    setError(null);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!name.trim() || !contact.trim()) {
      setError("Please fill in name and contact.");
      return;
    }

    setIsPending(true);
    const checkinDate = format(new Date(), "yyyy-MM-dd");
    const result = await submitWalkinCheckin({
      name: name.trim(),
      contact: contact.trim(),
      invitedByType: invitedBy === PLUGIN_VALUE ? "plugin" : invitedBy.startsWith("coach:") ? "coach" : "customer",
      invitedByCoachId: invitedBy.startsWith("coach:") ? invitedBy.slice("coach:".length) : null,
      invitedByCustomerId: invitedBy.startsWith("customer:") ? invitedBy.slice("customer:".length) : null,
      consumptionType,
      checkinDate,
    });
    setIsPending(false);

    if (result.error) {
      setError(result.error);
      toast.error(result.error);
      return;
    }

    toast.success(`${result.name} checked in as Ala Carte.`);
    reset();
    onOpenChange(false);
    onDone({ name: result.name!, balance: result.balance! });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Walk-in check-in (Ala Carte)</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <p className="rounded-md bg-destructive/10 p-2 text-sm text-destructive">{error}</p>
          )}

          <div className="space-y-1">
            <Label>Name *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} required />
          </div>

          <div className="space-y-1">
            <Label>Contact *</Label>
            <Input value={contact} onChange={(e) => setContact(e.target.value)} required />
          </div>

          <div className="space-y-1">
            <Label>Invited by *</Label>
            <Combobox
              options={invitedByOptions}
              value={invitedBy}
              onChange={setInvitedBy}
              placeholder="Choose coach, customer, or Plug-in"
              searchPlaceholder="Search coaches or customers..."
            />
          </div>

          <div>
            <Label className="mb-2 block">Consumption type</Label>
            <RadioGroup value={consumptionType} onValueChange={(v) => setConsumptionType(v as ConsumptionType)}>
              {CONSUMPTION_TYPES.map((type) => (
                <div key={type} className="flex items-center gap-2">
                  <RadioGroupItem value={type} id={`walkin-type-${type}`} />
                  <Label htmlFor={`walkin-type-${type}`} className="font-normal">
                    {type}
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </div>

          <p className="text-xs text-muted-foreground">
            This creates a one-time &quot;Ala Carte&quot; customer, checks them in for 1 cup, and
            marks them inactive automatically — they won&apos;t clutter the Customers list. If
            they come back for a real package, reactivate them from the Customers page instead
            of adding them again.
          </p>

          <Button type="submit" disabled={isPending} className="w-full text-base">
            {isPending ? "Checking in..." : "Check in"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
