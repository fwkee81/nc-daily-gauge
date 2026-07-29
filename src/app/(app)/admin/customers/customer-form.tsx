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
import {
  createCustomer,
  linkCustomerToSpouse,
  unlinkCustomer,
  updateCustomer,
  type CustomerFormInput,
} from "./actions";
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

// Packages worth a congratulations pop — Ala Carte is a one-off walk-in, not
// a package sign-up, so it's deliberately excluded.
const CELEBRATE_LEVELS: CustomerNcLevel[] = ["5-day", "10-day", "20-day", "30-day"];

export function CustomerForm({
  coaches,
  customers,
  editing,
  onDone,
}: {
  coaches: CoachOption[];
  customers: CustomerRow[];
  editing?: CustomerRow | null;
  onDone: (celebration?: { name: string; ncLevel: CustomerNcLevel }) => void;
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
  const [isPjs, setIsPjs] = useState(editing?.is_pjs ?? false);
  const [isHealthAmbassador, setIsHealthAmbassador] = useState(editing?.is_health_ambassador ?? false);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [linkTargetId, setLinkTargetId] = useState<string | null>(null);
  const [linkPending, setLinkPending] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);

  // Couple/Family are no longer offered for new selections, but an existing
  // customer already set to one keeps showing it here instead of looking
  // blank — same reasoning as invitedByOptions below.
  const genderOptions: CustomerGender[] = useMemo(() => {
    if (editing && editing.gender && !CUSTOMER_GENDERS.includes(editing.gender)) {
      return [...CUSTOMER_GENDERS, editing.gender];
    }
    return CUSTOMER_GENDERS;
  }, [editing]);

  const linkOptions: ComboboxOption[] = useMemo(() => {
    if (!editing) return [];
    return customers
      .filter((c) => c.id !== editing.id && c.active && !c.linked_to_customer_id)
      .map((c) => ({
        value: c.id,
        label: c.name,
        description: `${c.consumption_balance} left`,
      }));
  }, [customers, editing]);

  async function handleLink() {
    if (!editing || !linkTargetId) return;
    setLinkError(null);
    setLinkPending(true);
    const result = await linkCustomerToSpouse(editing.id, linkTargetId);
    setLinkPending(false);

    if (result?.error) {
      setLinkError(result.error);
      return;
    }
    toast.success(`${editing.name} is now linked and shares a balance.`);
    onDone();
  }

  async function handleUnlink() {
    if (!editing) return;
    setLinkError(null);
    setLinkPending(true);
    const result = await unlinkCustomer(editing.id);
    setLinkPending(false);

    if (result?.error) {
      setLinkError(result.error);
      return;
    }
    toast.success(`${editing.name} unlinked — their balance was forfeited.`);
    onDone();
  }

  const computedAge = dob ? differenceInYears(new Date(), new Date(dob)) : null;

  const invitedByOptions: ComboboxOption[] = useMemo(() => {
    const options: ComboboxOption[] = [{ value: PLUGIN_VALUE, label: "Plug-in" }];
    for (const c of coaches) {
      options.push({ value: `coach:${c.id}`, label: c.name, description: "Coach" });
    }
    for (const c of customers) {
      if (editing && c.id === editing.id) continue;
      // Hide inactive customers from new selections, but keep whichever one
      // is already set as this customer's inviter so editing doesn't show a
      // blank "Invited by" for an existing record.
      if (!c.active && c.id !== editing?.invited_by_customer_id) continue;
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
      isPjs,
      isHealthAmbassador,
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
    const shouldCelebrate = !editing && CELEBRATE_LEVELS.includes(ncLevel as CustomerNcLevel);
    onDone(shouldCelebrate ? { name, ncLevel: ncLevel as CustomerNcLevel } : undefined);
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
              {genderOptions.map((g) => (
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
            disabled={!!editing}
            required
          />
          {editing && (
            <p className="text-xs text-muted-foreground">
              View only — use Renew to change a customer&apos;s balance.
            </p>
          )}
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

      <div className="flex flex-wrap gap-4">
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={isPjs} onCheckedChange={setIsPjs} />
          PJS
        </label>
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={isHealthAmbassador} onCheckedChange={setIsHealthAmbassador} />
          Health Ambassador
        </label>
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

      <div className="space-y-2 rounded-md border p-3">
        <Label>Family / shared members</Label>
        <p className="text-xs text-muted-foreground">
          Link this customer&apos;s account to a spouse or family member who already has their own
          profile, so they share one consumption balance going forward.
        </p>

        {!editing ? (
          <p className="text-xs text-muted-foreground">
            Save the customer first, then edit them to link a family member.
          </p>
        ) : editing.linked_to_customer_id ? (
          <>
            <p className="text-sm">
              Shares <span className="font-medium">{editing.linked_to_customer?.name}</span>&apos;s
              balance.
            </p>
            {linkError && <p className="text-sm text-destructive">{linkError}</p>}
            <Button type="button" size="sm" variant="outline" disabled={linkPending} onClick={handleUnlink}>
              {linkPending ? "Unlinking..." : "Unlink"}
            </Button>
          </>
        ) : (
          <>
            {linkError && <p className="text-sm text-destructive">{linkError}</p>}
            <Combobox
              options={linkOptions}
              value={linkTargetId}
              onChange={setLinkTargetId}
              placeholder="Choose the account to share with"
              searchPlaceholder="Search customers..."
              emptyText="No eligible customers found."
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!linkTargetId || linkPending}
              onClick={handleLink}
            >
              {linkPending ? "Linking..." : "Link"}
            </Button>
          </>
        )}
      </div>

      <Button type="submit" disabled={isPending} className="w-full">
        {isPending ? "Saving..." : editing ? "Save changes" : "Add customer"}
      </Button>
    </form>
  );
}
