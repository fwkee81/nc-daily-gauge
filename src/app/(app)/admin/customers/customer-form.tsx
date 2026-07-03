"use client";

import { useMemo, useState, type FormEvent } from "react";
import { differenceInYears } from "date-fns";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Combobox, type ComboboxOption } from "@/components/combobox";
import { CUSTOMER_GENDERS, CUSTOMER_NC_LEVELS, MEMBER_TYPES } from "@/lib/constants";
import type { CustomerGender, CustomerNcLevel, MemberType } from "@/lib/types/database";
import { createCustomer, updateCustomer, type CustomerFormInput } from "./actions";
import type { CustomerRow } from "./customers-client";

interface CoachOption {
  id: string;
  name: string;
}

const PLUGIN_VALUE = "plugin";

function invitedByValue(customer?: CustomerRow | null) {
  if (!customer) return PLUGIN_VALUE;
  if (customer.invited_by_type === "coach" && customer.invited_by_coach_id) {
    return `coach:${customer.invited_by_coach_id}`;
  }
  if (customer.invited_by_type === "customer" && customer.invited_by_customer_id) {
    return `customer:${customer.invited_by_customer_id}`;
  }
  return PLUGIN_VALUE;
}

export function CustomerForm({
  coaches,
  customers,
  editing,
  onDone,
}: {
  coaches: CoachOption[];
  customers: CustomerRow[];
  editing?: CustomerRow | null;
  onDone: () => void;
}) {
  const [name, setName] = useState(editing?.name ?? "");
  const [gender, setGender] = useState<CustomerGender | "">(editing?.gender ?? "");
  const [contact, setContact] = useState(editing?.contact ?? "");
  const [dob, setDob] = useState(editing?.dob ?? "");
  const [manualAge, setManualAge] = useState(editing?.age_override != null);
  const [ageOverride, setAgeOverride] = useState<string>(
    editing?.age_override != null ? String(editing.age_override) : ""
  );
  const [ncLevel, setNcLevel] = useState<CustomerNcLevel | "">(editing?.nc_level ?? "");
  const [consumptionBalance, setConsumptionBalance] = useState(
    editing ? String(editing.consumption_balance) : "0"
  );
  const [invitedBy, setInvitedBy] = useState<string>(invitedByValue(editing));
  const [coachId, setCoachId] = useState<string | null>(editing?.coach_id ?? null);
  const [memberId, setMemberId] = useState(editing?.member_id ?? "");
  const [memberType, setMemberType] = useState<MemberType | "">(editing?.member_type ?? "");
  const [remark, setRemark] = useState(editing?.remark ?? "");
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const computedAge = dob ? differenceInYears(new Date(), new Date(dob)) : null;

  const invitedByOptions: ComboboxOption[] = useMemo(() => {
    const options: ComboboxOption[] = [{ value: PLUGIN_VALUE, label: "Plug-in" }];
    for (const c of coaches) {
      options.push({ value: `coach:${c.id}`, label: c.name, description: "Coach" });
    }
    for (const c of customers) {
      if (editing && c.id === editing.id) continue;
      options.push({ value: `customer:${c.id}`, label: c.name, description: "Customer" });
    }
    return options;
  }, [coaches, customers, editing]);

  const coachOptions: ComboboxOption[] = useMemo(
    () => coaches.map((c) => ({ value: c.id, label: c.name })),
    [coaches]
  );

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!name || !gender || !contact || !dob || !ncLevel) {
      setError("Please fill in all required fields.");
      return;
    }
    if (manualAge && !ageOverride) {
      setError("Please enter the manual age, or turn off manual age.");
      return;
    }

    const input: CustomerFormInput = {
      name,
      gender: gender as CustomerGender,
      contact,
      dob,
      ageOverride: manualAge ? Number(ageOverride) : null,
      ncLevel: ncLevel as CustomerNcLevel,
      consumptionBalance: Number(consumptionBalance),
      invitedByType: invitedBy === PLUGIN_VALUE ? "plugin" : invitedBy.startsWith("coach:") ? "coach" : "customer",
      invitedByCoachId: invitedBy.startsWith("coach:") ? invitedBy.slice("coach:".length) : null,
      invitedByCustomerId: invitedBy.startsWith("customer:") ? invitedBy.slice("customer:".length) : null,
      coachId,
      memberId: memberId.trim() || null,
      memberType: memberType || null,
      remark: remark.trim() || null,
    };

    setIsPending(true);
    const result = editing ? await updateCustomer(editing.id, input) : await createCustomer(input);
    setIsPending(false);

    if (result?.error) {
      setError(result.error);
      toast.error(result.error);
      return;
    }

    toast.success(editing ? "Customer updated." : "Customer added.");
    onDone();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <p className="rounded-md bg-destructive/10 p-2 text-sm text-destructive">{error}</p>
      )}

      <div className="space-y-1">
        <Label>Name *</Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} required />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label>Gender *</Label>
          <Select value={gender} onValueChange={(v) => setGender(v as CustomerGender)}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select" />
            </SelectTrigger>
            <SelectContent>
              {CUSTOMER_GENDERS.map((g) => (
                <SelectItem key={g} value={g}>
                  {g}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Contact *</Label>
          <Input value={contact} onChange={(e) => setContact(e.target.value)} required />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label>Date of birth *</Label>
          <Input type="date" value={dob} onChange={(e) => setDob(e.target.value)} required />
        </div>
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <Label>Age</Label>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Manual</span>
              <Switch checked={manualAge} onCheckedChange={setManualAge} />
            </div>
          </div>
          {manualAge ? (
            <Input
              type="number"
              min={0}
              value={ageOverride}
              onChange={(e) => setAgeOverride(e.target.value)}
            />
          ) : (
            <Input value={computedAge ?? ""} disabled placeholder="Auto from DOB" />
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label>NC Level *</Label>
          <Select value={ncLevel} onValueChange={(v) => setNcLevel(v as CustomerNcLevel)}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select" />
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
          <Label>Consumption Balance *</Label>
          <Input
            type="number"
            value={consumptionBalance}
            onChange={(e) => setConsumptionBalance(e.target.value)}
            required
          />
        </div>
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

      <div className="space-y-1">
        <Label>Coach</Label>
        <Combobox
          options={coachOptions}
          value={coachId}
          onChange={setCoachId}
          placeholder="Choose coach"
          searchPlaceholder="Search coaches..."
          emptyText="No coaches found."
        />
        <p className="text-xs text-muted-foreground">
          Who this customer counts toward in Coach&apos;s Cup — separate from who invited them.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label>Member ID</Label>
          <Input value={memberId} onChange={(e) => setMemberId(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Member Type</Label>
          <Select
            value={memberType}
            onValueChange={(v) => setMemberType(v as MemberType)}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="None" />
            </SelectTrigger>
            <SelectContent>
              {MEMBER_TYPES.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-1">
        <Label>Remark</Label>
        <Textarea
          value={remark}
          onChange={(e) => setRemark(e.target.value)}
          placeholder="Any notes about this customer..."
          rows={3}
        />
      </div>

      <Button type="submit" disabled={isPending} className="w-full">
        {isPending ? "Saving..." : editing ? "Save changes" : "Add customer"}
      </Button>
    </form>
  );
}
