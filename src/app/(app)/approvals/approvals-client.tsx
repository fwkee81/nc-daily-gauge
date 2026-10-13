"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { format, parseISO } from "date-fns";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { PendingCoachApproval } from "@/lib/types/database";
import { approveCoach, rejectCoach } from "./actions";

export function ApprovalsClient({ pending }: { pending: PendingCoachApproval[] }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState<{ coach: PendingCoachApproval; action: "approve" | "reject" } | null>(
    null
  );
  const [isPending, setIsPending] = useState(false);

  async function handleConfirm() {
    if (!confirming) return;
    setIsPending(true);
    const result =
      confirming.action === "approve"
        ? await approveCoach(confirming.coach.id)
        : await rejectCoach(confirming.coach.id);
    setIsPending(false);

    if (result?.error) {
      toast.error(result.error);
      return;
    }
    toast.success(
      confirming.action === "approve"
        ? `${confirming.coach.name} approved.`
        : `${confirming.coach.name}'s registration was rejected.`
    );
    setConfirming(null);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Pending approvals</h1>
      <p className="text-sm text-muted-foreground">
        New registrations where you&apos;re an admin somewhere in their sponsor line — approve to
        let them in, or reject if this wasn&apos;t a legitimate sign-up.
      </p>

      {pending.length === 0 ? (
        <p className="rounded-md border bg-muted/20 p-4 text-sm text-muted-foreground">
          Nothing waiting on you right now.
        </p>
      ) : (
        <ul className="space-y-2">
          {pending.map((p) => (
            <li key={p.id} className="space-y-2 rounded-md border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-medium">{p.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {p.contact} · Member ID {p.member_id}
                  </p>
                </div>
                <Badge variant="secondary">{p.nc_position}</Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                Club: <span className="text-foreground">{p.nc_club_name ?? "—"}</span> · Sponsor:{" "}
                <span className="text-foreground">{p.sponsor_name ?? "—"}</span> · Requested{" "}
                {format(parseISO(p.created_at), "d MMM yyyy")}
              </p>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setConfirming({ coach: p, action: "reject" })}
                >
                  Reject
                </Button>
                <Button size="sm" onClick={() => setConfirming({ coach: p, action: "approve" })}>
                  Approve
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <AlertDialog open={!!confirming} onOpenChange={(open) => !open && setConfirming(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirming?.action === "approve" ? "Approve" : "Reject"} {confirming?.coach.name}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirming?.action === "approve"
                ? "They'll be able to sign in and use the app immediately."
                : "Their registration will be closed. They'd need to sign up again to retry."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={isPending} onClick={handleConfirm}>
              {isPending ? "Saving..." : confirming?.action === "approve" ? "Approve" : "Reject"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
