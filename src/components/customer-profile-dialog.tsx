"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { differenceInYears, parseISO } from "date-fns";
import { ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getCustomerProfile } from "@/lib/actions/customer-profile";
import { deactivateCustomer, reactivateCustomer } from "@/app/(app)/admin/customers/actions";
import { RecentCheckins } from "@/components/recent-checkins";
import { RecentWellnessLogs } from "@/components/recent-wellness-logs";
import { WhatsAppLink } from "@/components/whatsapp-link";

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
  linked_to_customer_id: string | null;
  coach: { name: string } | null;
  invited_by_coach: { name: string } | null;
  invitedByCustomerName: string | null;
  linkedToCustomerName: string | null;
  linkedAccounts: { id: string; name: string }[];
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
  canManage = false,
}: {
  customerId: string | null;
  name: string;
  onOpenChange: (open: boolean) => void;
  // Only the Customers admin page (already admin-gated) passes this — Daily
  // Report's read-only popup leaves it off so non-admin coaches never see a
  // button that would just get rejected server-side.
  canManage?: boolean;
}) {
  const router = useRouter();
  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"visits" | "wellness">("visits");
  const [statusPending, setStatusPending] = useState(false);

  function loadProfile() {
    if (!customerId) return;
    getCustomerProfile(customerId).then((res) => {
      if ("data" in res) setProfile(res.data as unknown as CustomerProfile);
      else setError(res.error ?? "Could not load customer.");
    });
  }

  useEffect(() => {
    loadProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId]);

  async function handleDeactivate() {
    if (!customerId) return;
    setStatusPending(true);
    const result = await deactivateCustomer(customerId);
    setStatusPending(false);
    if (result?.error) {
      toast.error(result.error);
      return;
    }
    toast.success("Customer deactivated.");
    loadProfile();
    router.refresh();
  }

  async function handleReactivate() {
    if (!customerId) return;
    setStatusPending(true);
    const result = await reactivateCustomer(customerId);
    setStatusPending(false);
    if (result?.error) {
      toast.error(result.error);
      return;
    }
    toast.success("Customer reactivated.");
    loadProfile();
    router.refresh();
  }

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
                <WhatsAppLink contact={profile.contact} />
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

            {canManage && (
              <div>
                {profile.active ? (
                  <AlertDialog>
                    <AlertDialogTrigger
                      render={<Button size="sm" variant="outline" disabled={statusPending} />}
                    >
                      Deactivate
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Deactivate {profile.name}?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This hides the customer from check-in and the Customers list — it does
                          not delete their record. Their past check-in history is kept for
                          reporting, and you can undo this anytime with Reactivate.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDeactivate}>Deactivate</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                ) : (
                  <Button size="sm" variant="outline" disabled={statusPending} onClick={handleReactivate}>
                    Reactivate
                  </Button>
                )}
              </div>
            )}

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
                    <li key={m.id} className="flex items-center gap-1">
                      {m.name}
                      {m.contact && (
                        <>
                          <span className="text-muted-foreground">·</span>
                          <WhatsAppLink contact={m.contact} />
                        </>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {profile.linked_to_customer_id && (
              <div>
                <p className="text-xs text-muted-foreground">Linked account</p>
                <p>Shares {profile.linkedToCustomerName ?? "—"}&apos;s balance</p>
              </div>
            )}

            {profile.linkedAccounts.length > 0 && (
              <div>
                <p className="text-xs text-muted-foreground">Linked account</p>
                <ul className="mt-1 space-y-0.5">
                  {profile.linkedAccounts.map((a) => (
                    <li key={a.id}>{a.name} shares this balance</li>
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
              <div className="space-y-2 pt-1">
                <p className="text-xs text-muted-foreground">Last 5 readings</p>
                <RecentWellnessLogs customerId={profile.id} />
                <Link
                  href={`/wellness-report/${profile.id}`}
                  className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm transition-colors hover:bg-accent"
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
