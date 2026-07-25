"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { differenceInYears, parseISO } from "date-fns";
import { Activity, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getCustomerProfile } from "@/lib/actions/customer-profile";
import { RecentCheckins } from "@/components/recent-checkins";

interface CustomerProfile {
  id: string;
  name: string;
  gender: string;
  contact: string;
  dob: string | null;
  age_override: number | null;
  nc_level: string;
  consumption_balance: number;
  invited_by_type: string;
  member_id: string | null;
  member_type: string | null;
  remark: string | null;
  is_pjs: boolean;
  is_health_ambassador: boolean;
  active: boolean;
  coach: { name: string } | null;
  invited_by_coach: { name: string } | null;
  invitedByCustomerName: string | null;
  members: { id: string; name: string; contact: string | null; dob: string | null }[];
}

function invitedByLabel(p: CustomerProfile) {
  if (p.invited_by_type === "plugin") return "Plug-in";
  if (p.invited_by_type === "coach") return p.invited_by_coach?.name ?? "—";
  return p.invitedByCustomerName ?? "—";
}

function ageOf(p: CustomerProfile) {
  if (p.age_override != null) return p.age_override;
  if (!p.dob) return null;
  return differenceInYears(new Date(), parseISO(p.dob));
}

// The one "click a customer's name" popup, shared by Daily Report and the
// Customers page (they used to be two hand-copied dialogs that had already
// started drifting). Basic profile fields always show; Visit Trend and
// Wellness Report live in tabs below so any future addition — a new report,
// a new history view — just becomes another tab here instead of another
// fork.
export function CustomerProfileDialog({
  customerId,
  name,
  onOpenChange,
}: {
  customerId: string | null;
  name: string;
  onOpenChange: (open: boolean) => void;
}) {
  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"visits" | "wellness">("visits");

  useEffect(() => {
    if (!customerId) return;
    getCustomerProfile(customerId).then((res) => {
      if ("data" in res) setProfile(res.data as unknown as CustomerProfile);
      else setError(res.error ?? "Could not load customer.");
    });
  }, [customerId]);

  return (
    <Dialog
      open={!!customerId}
      onOpenChange={(next) => {
        if (!next) {
          setProfile(null);
          setError(null);
          setTab("visits");
        }
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{name}</DialogTitle>
        </DialogHeader>

        {error && <p className="text-sm text-destructive">{error}</p>}

        {!error && !profile && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-x-4 gap-y-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="space-y-1.5">
                  <div className="h-3 w-14 animate-pulse rounded bg-muted" />
                  <div className="h-4 w-20 animate-pulse rounded bg-muted" />
                </div>
              ))}
            </div>
            <div className="h-24 animate-pulse rounded-lg bg-muted" />
          </div>
        )}

        {profile && (
          <div className="space-y-4 text-sm">
            <div className="grid grid-cols-2 gap-x-4 gap-y-2">
              <div>
                <p className="text-xs text-muted-foreground">Gender</p>
                <p>{profile.gender}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Contact</p>
                <p>{profile.contact}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Age</p>
                <p>{ageOf(profile) ?? "—"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">NC Level</p>
                <p>{profile.nc_level}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Consumption balance</p>
                <p>{profile.consumption_balance}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Invited by</p>
                <p>{invitedByLabel(profile)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Coach</p>
                <p>{profile.coach?.name ?? "—"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Member</p>
                <p>
                  {profile.member_id ? `${profile.member_id} (${profile.member_type ?? "—"})` : "—"}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Status</p>
                <p>{profile.active ? "Active" : "Inactive"}</p>
              </div>
            </div>

            {(profile.is_pjs || profile.is_health_ambassador) && (
              <div className="flex gap-1.5">
                {profile.is_pjs && <Badge variant="outline">PJS</Badge>}
                {profile.is_health_ambassador && <Badge variant="outline">Health Ambassador</Badge>}
              </div>
            )}

            <div>
              <p className="text-xs text-muted-foreground">Remark</p>
              <p>{profile.remark || "—"}</p>
            </div>

            {profile.members.length > 0 && (
              <div>
                <p className="text-xs text-muted-foreground">Shares account with</p>
                <ul className="mt-1 space-y-0.5">
                  {profile.members.map((m) => (
                    <li key={m.id}>
                      {m.name}
                      {m.contact && <span className="text-muted-foreground"> · {m.contact}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <Separator />

            {/* Content is rendered manually below rather than via TabsContent —
                Base UI's Tabs.Panel doesn't hide the inactive panel here, so
                both would show at once. */}
            <Tabs value={tab} onValueChange={(v) => setTab(v as "visits" | "wellness")}>
              <TabsList className="w-full">
                <TabsTrigger value="visits">Visit Trend</TabsTrigger>
                <TabsTrigger value="wellness">Wellness Report</TabsTrigger>
              </TabsList>
            </Tabs>

            {tab === "visits" && (
              <div className="pt-1">
                <RecentCheckins customerId={profile.id} />
              </div>
            )}

            {tab === "wellness" && (
              <div className="pt-1">
                <div className="flex items-center gap-3 rounded-lg border p-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
                    <Activity className="size-4.5" strokeWidth={2.25} />
                  </span>
                  <div>
                    <p className="font-medium">My Wellness profile</p>
                    <p className="text-xs text-muted-foreground">
                      Body composition history and Tanita readings.
                    </p>
                  </div>
                </div>
                <Link
                  href={`/wellness-report/${profile.id}`}
                  className="mt-3 inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm transition-colors hover:bg-accent"
                >
                  Open Wellness Report <ChevronRight className="size-4 text-muted-foreground" />
                </Link>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// Wrapper for call sites that just want a clickable name (Daily Report's
// check-in list) rather than externally-controlled open state (Customers
// page, which drives it from a row click).
export function CustomerProfileTrigger({ customerId, name }: { customerId: string; name: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button variant="link" className="h-auto p-0" onClick={() => setOpen(true)}>
        {name}
      </Button>
      <CustomerProfileDialog customerId={open ? customerId : null} name={name} onOpenChange={setOpen} />
    </>
  );
}
