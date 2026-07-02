"use client";

import { useState, useTransition, type FormEvent } from "react";
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
import { COACH_LEVELS, NC_CLUBS, NC_POSITIONS } from "@/lib/constants";
import { completeOnboarding } from "./actions";
import type { CoachLevel, NcPosition } from "@/lib/types/database";

interface CoachOption {
  id: string;
  name: string;
  nc_position: string;
}

export function OnboardingForm({
  coaches,
  isFirstCoach,
}: {
  coaches: CoachOption[];
  isFirstCoach: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [dob, setDob] = useState("");
  const [noSponsor, setNoSponsor] = useState(isFirstCoach);
  const [sponsorId, setSponsorId] = useState<string | null>(null);
  const [memberId, setMemberId] = useState("");
  const [level, setLevel] = useState<CoachLevel | "">("");
  const [clubName, setClubName] = useState<(typeof NC_CLUBS)[number] | "">("");
  const [ncPosition, setNcPosition] = useState<NcPosition | "">("");

  const sponsorOptions: ComboboxOption[] = coaches.map((c) => ({
    value: c.id,
    label: c.name,
    description: c.nc_position,
  }));

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!name || !contact || !dob || !memberId || !level || !ncPosition) {
      setError("Please fill in all required fields.");
      return;
    }
    if (!noSponsor && !sponsorId) {
      setError("Please choose a sponsor, or mark yourself as the founding coach.");
      return;
    }
    if (!clubName) {
      setError("Please choose your nutrition club.");
      return;
    }

    startTransition(async () => {
      const result = await completeOnboarding({
        name,
        contact,
        dob,
        sponsorId: noSponsor ? null : sponsorId,
        memberId,
        level: level as CoachLevel,
        clubName,
        ncPosition: ncPosition as NcPosition,
      });
      if (result?.error) {
        setError(result.error);
        toast.error(result.error);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 space-y-4">
      {error && (
        <p className="rounded-md bg-destructive/10 p-2 text-sm text-destructive">{error}</p>
      )}

      <div className="space-y-1">
        <Label>Name *</Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} required />
      </div>

      <div className="space-y-1">
        <Label>Contact *</Label>
        <Input
          value={contact}
          onChange={(e) => setContact(e.target.value)}
          required
          placeholder="Phone number"
        />
      </div>

      <div className="space-y-1">
        <Label>Date of birth *</Label>
        <Input type="date" value={dob} onChange={(e) => setDob(e.target.value)} required />
      </div>

      <div className="space-y-2">
        <Label>Sponsor *</Label>
        {!noSponsor && (
          <Combobox
            options={sponsorOptions}
            value={sponsorId}
            onChange={setSponsorId}
            placeholder="Choose your sponsor coach"
            searchPlaceholder="Search coaches..."
            emptyText="No coaches yet."
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
          I&apos;m the founding coach — no sponsor
        </label>
      </div>

      <div className="space-y-1">
        <Label>Member ID *</Label>
        <Input value={memberId} onChange={(e) => setMemberId(e.target.value)} required />
      </div>

      <div className="space-y-1">
        <Label>Level *</Label>
        <Select value={level} onValueChange={(v) => setLevel(v as CoachLevel)}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Select level" />
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
        <Label>Nutrition Club *</Label>
        <Select value={clubName} onValueChange={(v) => setClubName(v as (typeof NC_CLUBS)[number])}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Select your club" />
          </SelectTrigger>
          <SelectContent>
            {NC_CLUBS.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1">
        <Label>NC Position *</Label>
        <Select value={ncPosition} onValueChange={(v) => setNcPosition(v as NcPosition)}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Select position" />
          </SelectTrigger>
          <SelectContent>
            {NC_POSITIONS.map((p) => (
              <SelectItem key={p} value={p}>
                {p}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          Owner and Internship positions get admin access to manage customers.
        </p>
      </div>

      <Button type="submit" disabled={isPending} className="w-full">
        {isPending ? "Saving..." : "Complete profile"}
      </Button>
    </form>
  );
}
