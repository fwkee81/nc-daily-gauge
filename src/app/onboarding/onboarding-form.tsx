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
import { COACH_LEVELS, NC_POSITIONS } from "@/lib/constants";
import { completeOnboarding, verifySponsor } from "./actions";
import type { CoachLevel, NcPosition } from "@/lib/types/database";

interface ClubOption {
  id: string;
  name: string;
}

// Step 1: verify + confirm the sponsor before anything else is even asked —
// this is the actual gate (anyone who doesn't know a real, active coach's
// Herbalife Member ID can't get past this screen at all). Step 2 is the
// rest of the profile, with the sponsor already locked in.
export function OnboardingForm({ clubs }: { clubs: ClubOption[] }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [sponsorMemberId, setSponsorMemberId] = useState("");
  const [sponsor, setSponsor] = useState<{ id: string; name: string } | null>(null);
  const [sponsorConfirmed, setSponsorConfirmed] = useState(false);

  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [dob, setDob] = useState("");
  const [memberId, setMemberId] = useState("");
  const [level, setLevel] = useState<CoachLevel | "">("");
  const [clubName, setClubName] = useState("");
  const [clubOptions, setClubOptions] = useState<ComboboxOption[]>(() =>
    clubs.map((c) => ({ value: c.name, label: c.name }))
  );
  const [ncPosition, setNcPosition] = useState<NcPosition | "">("");

  function handleCreateClub(name: string) {
    setClubOptions((prev) => (prev.some((o) => o.value === name) ? prev : [...prev, { value: name, label: name }]));
    setClubName(name);
  }

  function handleVerifySponsor(e: FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await verifySponsor(sponsorMemberId);
      if ("error" in result) {
        setError(result.error ?? "Could not verify that sponsor.");
        return;
      }
      setSponsor(result.data ?? null);
    });
  }

  function handleChangeSponsor() {
    setSponsor(null);
    setSponsorConfirmed(false);
    setSponsorMemberId("");
    setError(null);
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!sponsor) return;
    if (!name || !contact || !dob || !memberId || !level || !ncPosition) {
      setError("Please fill in all required fields.");
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
        sponsorId: sponsor.id,
        memberId,
        level: level as CoachLevel,
        clubName: clubName.trim(),
        ncPosition: ncPosition as NcPosition,
      });
      if (result?.error) {
        setError(result.error);
        toast.error(result.error);
      }
    });
  }

  if (!sponsorConfirmed) {
    return (
      <div className="mt-6 space-y-4">
        {error && (
          <p className="rounded-md bg-destructive/10 p-2 text-sm text-destructive">{error}</p>
        )}

        {!sponsor ? (
          <form onSubmit={handleVerifySponsor} className="space-y-4">
            <div className="space-y-1">
              <Label>Your sponsor&apos;s Herbalife Member ID *</Label>
              <Input
                value={sponsorMemberId}
                onChange={(e) => setSponsorMemberId(e.target.value)}
                placeholder="e.g. 1234567"
                required
              />
              <p className="text-xs text-muted-foreground">
                We check this against our existing coaches before you can continue — ask your
                sponsor if you&apos;re not sure of their ID.
              </p>
            </div>
            <Button type="submit" disabled={isPending} className="w-full">
              {isPending ? "Checking..." : "Verify sponsor"}
            </Button>
          </form>
        ) : (
          <div className="space-y-3 rounded-md border p-4">
            <p className="text-sm">
              Is <span className="font-medium">{sponsor.name}</span> your sponsor?
            </p>
            <div className="flex gap-2">
              <Button type="button" variant="outline" className="flex-1" onClick={handleChangeSponsor}>
                No, try again
              </Button>
              <Button type="button" className="flex-1" onClick={() => setSponsorConfirmed(true)}>
                Yes, that&apos;s my sponsor
              </Button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 space-y-4">
      {error && (
        <p className="rounded-md bg-destructive/10 p-2 text-sm text-destructive">{error}</p>
      )}

      <div className="flex items-center justify-between rounded-md border bg-muted/30 p-2 text-sm">
        <span>
          Sponsor: <span className="font-medium">{sponsor!.name}</span>
        </span>
        <Button type="button" variant="link" className="h-auto p-0" onClick={handleChangeSponsor}>
          Change
        </Button>
      </div>

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

      <div className="space-y-1">
        <Label>Your Herbalife Member ID *</Label>
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
        <Combobox
          options={clubOptions}
          value={clubName || null}
          onChange={setClubName}
          allowCreate
          onCreate={handleCreateClub}
          placeholder="Select your club"
          searchPlaceholder="Search or add a club..."
          emptyText="No clubs found."
        />
        <p className="text-xs text-muted-foreground">
          Don&apos;t see your club? Type its name and choose &quot;Create&quot; to add it.
        </p>
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

      <p className="text-xs text-muted-foreground">
        Your account won&apos;t be active until an admin above {sponsor!.name} in your sponsor line
        approves it.
      </p>

      <Button type="submit" disabled={isPending} className="w-full">
        {isPending ? "Saving..." : "Complete profile"}
      </Button>
    </form>
  );
}
