"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import type { Coach } from "@/lib/types/database";
import { updateProfile } from "./actions";

export function ProfileForm({
  coach,
  clubName,
  sponsorName,
}: {
  coach: Coach;
  clubName: string | null;
  sponsorName: string | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [name, setName] = useState(coach.name);
  const [contact, setContact] = useState(coach.contact);
  const [dob, setDob] = useState(coach.dob);

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
            Only the network admin can change these — ask them if something needs updating.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <DetailRow label="Member ID" value={coach.member_id} />
          <Separator />
          <DetailRow label="Level" value={coach.level} />
          <Separator />
          <DetailRow label="NC Position" value={coach.nc_position} />
          <Separator />
          <DetailRow label="Nutrition Club" value={clubName ?? "—"} />
          <Separator />
          <DetailRow label="Sponsor" value={sponsorName ?? "—"} />
          <Separator />
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Status</span>
            <Badge variant={coach.active ? "secondary" : "destructive"}>
              {coach.active ? "Active" : "Inactive"}
            </Badge>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
