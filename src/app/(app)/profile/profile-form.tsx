"use client";

import { useMemo, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Combobox, type ComboboxOption } from "@/components/combobox";
import { COACH_LEVELS, NC_POSITIONS } from "@/lib/constants";
import type { Coach, CoachLevel, NcPosition } from "@/lib/types/database";
import { updateProfile, updateCoachingDetails } from "./actions";

interface CoachOption {
  id: string;
  name: string;
}

interface ClubOption {
  id: string;
  name: string;
}

export function ProfileForm({
  coach,
  sponsorOptions,
  clubOptions,
}: {
  coach: Coach;
  sponsorOptions: CoachOption[];
  clubOptions: ClubOption[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [name, setName] = useState(coach.name);
  const [contact, setContact] = useState(coach.contact);
  const [dob, setDob] = useState(coach.dob);

  const [isCoachingPending, startCoachingTransition] = useTransition();
  const [noSponsor, setNoSponsor] = useState(!coach.sponsor_id);
  const [sponsorId, setSponsorId] = useState<string | null>(coach.sponsor_id);
  const [memberId, setMemberId] = useState(coach.member_id);
  const [level, setLevel] = useState<CoachLevel>(coach.level);
  const [ncPosition, setNcPosition] = useState<NcPosition>(coach.nc_position);
  const [ncClubId, setNcClubId] = useState<string | null>(coach.nc_club_id);
  const [active, setActive] = useState(coach.active);

  const sponsorComboOptions: ComboboxOption[] = useMemo(
    () =>
      sponsorOptions.filter((c) => c.id !== coach.id).map((c) => ({ value: c.id, label: c.name })),
    [sponsorOptions, coach.id]
  );

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await updateProfile({ name, contact, dob });
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Profile updated.");
      router.refresh();
    });
  }

  function handleCoachingSubmit(e: FormEvent) {
    e.preventDefault();
    if (!memberId || !ncClubId) {
      toast.error("Please fill in all required fields.");
      return;
    }
    if (!noSponsor && !sponsorId) {
      toast.error("Please choose a sponsor, or mark yourself as having no sponsor.");
      return;
    }

    startCoachingTransition(async () => {
      const result = await updateCoachingDetails({
        sponsorId: noSponsor ? null : sponsorId,
        memberId,
        level,
        ncPosition,
        ncClubId,
        active,
      });
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Coaching details updated.");
      router.refresh();
    });
  }

  return (
    <div className="mt-6 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Personal details</CardTitle>
          <CardDescription>Only you can see and edit these.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1">
              <Label>Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div className="space-y-1">
              <Label>Contact</Label>
              <Input
                value={contact}
                onChange={(e) => setContact(e.target.value)}
                required
                placeholder="Phone number"
              />
            </div>
            <div className="space-y-1">
              <Label>Date of birth</Label>
              <Input type="date" value={dob} onChange={(e) => setDob(e.target.value)} required />
            </div>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Saving..." : "Save changes"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Coaching details</CardTitle>
          <CardDescription>
            Keep these accurate — they drive your reports, leaderboards, and admin access.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCoachingSubmit} className="space-y-4">
            <div className="space-y-1">
              <Label>Member ID *</Label>
              <Input value={memberId} onChange={(e) => setMemberId(e.target.value)} required />
            </div>

            <div className="space-y-1">
              <Label>Nutrition Club *</Label>
              <Select value={ncClubId ?? undefined} onValueChange={setNcClubId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Choose nutrition club">
                    {(value: string | null) =>
                      clubOptions.find((c) => c.id === value)?.name ?? "Choose nutrition club"
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {clubOptions.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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

            <div className="space-y-2">
              <Label>Sponsor</Label>
              {!noSponsor && (
                <Combobox
                  options={sponsorComboOptions}
                  value={sponsorId}
                  onChange={setSponsorId}
                  placeholder="Choose your sponsor coach"
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

            <div className="flex items-center gap-2">
              <Checkbox
                id="active-status"
                checked={active}
                onCheckedChange={(checked) => setActive(checked)}
              />
              <Label htmlFor="active-status" className="font-normal">
                Active
              </Label>
            </div>

            <Button type="submit" disabled={isCoachingPending}>
              {isCoachingPending ? "Saving..." : "Save changes"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
