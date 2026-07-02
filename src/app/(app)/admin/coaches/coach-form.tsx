"use client";

import { useMemo, useState, type FormEvent } from "react";
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
import { Combobox, type ComboboxOption } from "@/components/combobox";
import { COACH_LEVELS, NC_POSITIONS } from "@/lib/constants";
import type { CoachLevel, NcPosition } from "@/lib/types/database";
import { updateCoach, type CoachFormInput } from "./actions";
import type { CoachRow } from "./coaches-client";

interface SponsorOption {
  id: string;
  name: string;
}

export function CoachForm({
  coach,
  sponsorOptions,
  onDone,
}: {
  coach: CoachRow;
  sponsorOptions: SponsorOption[];
  onDone: () => void;
}) {
  const [name, setName] = useState(coach.name);
  const [contact, setContact] = useState(coach.contact);
  const [dob, setDob] = useState(coach.dob);
  const [noSponsor, setNoSponsor] = useState(!coach.sponsor_id);
  const [sponsorId, setSponsorId] = useState<string | null>(coach.sponsor_id);
  const [memberId, setMemberId] = useState(coach.member_id);
  const [level, setLevel] = useState<CoachLevel>(coach.level);
  const [ncPosition, setNcPosition] = useState<NcPosition>(coach.nc_position);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const options: ComboboxOption[] = useMemo(
    () =>
      sponsorOptions
        .filter((c) => c.id !== coach.id)
        .map((c) => ({ value: c.id, label: c.name })),
    [sponsorOptions, coach.id]
  );

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!name || !contact || !dob || !memberId) {
      setError("Please fill in all required fields.");
      return;
    }
    if (!noSponsor && !sponsorId) {
      setError("Please choose a sponsor, or mark as no sponsor.");
      return;
    }

    const input: CoachFormInput = {
      name,
      contact,
      dob,
      sponsorId: noSponsor ? null : sponsorId,
      memberId,
      level,
      ncPosition,
    };

    setIsPending(true);
    const result = await updateCoach(coach.id, input);
    setIsPending(false);

    if (result?.error) {
      setError(result.error);
      toast.error(result.error);
      return;
    }

    toast.success("Coach updated.");
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
          <Label>Contact *</Label>
          <Input value={contact} onChange={(e) => setContact(e.target.value)} required />
        </div>
        <div className="space-y-1">
          <Label>Date of birth *</Label>
          <Input type="date" value={dob} onChange={(e) => setDob(e.target.value)} required />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Sponsor</Label>
        {!noSponsor && (
          <Combobox
            options={options}
            value={sponsorId}
            onChange={setSponsorId}
            placeholder="Choose sponsor coach"
            searchPlaceholder="Search coaches..."
            emptyText="No coaches found."
          />
        )}
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={noSponsor}
            onChange={(e) => {
              setNoSponsor(e.target.checked);
              setSponsorId(null);
            }}
          />
          No sponsor (founding coach)
        </label>
      </div>

      <div className="space-y-1">
        <Label>Member ID *</Label>
        <Input value={memberId} onChange={(e) => setMemberId(e.target.value)} required />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label>Level *</Label>
          <Select value={level} onValueChange={(v) => setLevel(v as CoachLevel)}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {COACH_LEVELS.map((l) => (
                <SelectItem key={l} value={l}>
                  {l}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>NC Position *</Label>
          <Select value={ncPosition} onValueChange={(v) => setNcPosition(v as NcPosition)}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {NC_POSITIONS.map((p) => (
                <SelectItem key={p} value={p}>
                  {p}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Button type="submit" disabled={isPending} className="w-full">
        {isPending ? "Saving..." : "Save changes"}
      </Button>
    </form>
  );
}
