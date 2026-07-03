"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import { Badge } from "@/components/ui/badge";
import { CoachForm } from "./coach-form";
import { deactivateCoach } from "./actions";
import type { CoachLevel, NcPosition } from "@/lib/types/database";

export interface CoachRow {
  id: string;
  name: string;
  contact: string;
  dob: string;
  sponsor_id: string | null;
  member_id: string;
  level: CoachLevel;
  nc_position: NcPosition;
  nc_club_id: string | null;
  active: boolean;
  nc_club?: { name: string } | null;
}

interface SponsorOption {
  id: string;
  name: string;
}

interface ClubOption {
  id: string;
  name: string;
}

export function CoachesClient({
  currentCoachId,
  isSuperAdmin,
  coaches,
  sponsorOptions,
  clubOptions,
}: {
  currentCoachId: string;
  isSuperAdmin: boolean;
  coaches: CoachRow[];
  sponsorOptions: SponsorOption[];
  clubOptions: ClubOption[];
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<CoachRow | null>(null);

  const nameOf = (id: string | null) => sponsorOptions.find((c) => c.id === id)?.name ?? "—";

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return coaches;
    return coaches.filter(
      (c) => c.name.toLowerCase().includes(q) || c.contact.toLowerCase().includes(q)
    );
  }, [coaches, search]);

  async function handleDeactivate(id: string) {
    const result = await deactivateCoach(id);
    if (result?.error) {
      toast.error(result.error);
    } else {
      toast.success("Coach removed.");
      router.refresh();
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold">Coaches</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Your own club plus any downline branch that named you as sponsor. Coaches register
        themselves —{" "}
        {isSuperAdmin
          ? "you can fix details or remove someone who left."
          : "only the network admin can edit or remove a coach."}
      </p>

      <Input
        className="mt-4 max-w-sm"
        placeholder="Search by name or contact..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      <div className="mt-4 overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Club</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead>Level</TableHead>
              <TableHead>Position</TableHead>
              <TableHead>Sponsor</TableHead>
              <TableHead>Member ID</TableHead>
              {isSuperAdmin && <TableHead />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="font-medium">
                  {c.name}
                  {c.id === currentCoachId && (
                    <Badge variant="secondary" className="ml-2">
                      You
                    </Badge>
                  )}
                </TableCell>
                <TableCell>{c.nc_club?.name ?? "—"}</TableCell>
                <TableCell>{c.contact}</TableCell>
                <TableCell>{c.level}</TableCell>
                <TableCell>{c.nc_position}</TableCell>
                <TableCell>{nameOf(c.sponsor_id)}</TableCell>
                <TableCell>{c.member_id}</TableCell>
                {isSuperAdmin && (
                  <TableCell className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => setEditing(c)}>
                      Edit
                    </Button>
                    {c.id !== currentCoachId && (
                      <AlertDialog>
                        <AlertDialogTrigger render={<Button size="sm" variant="outline" />}>
                          Remove
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Remove {c.name}?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This hides the coach from pickers and this list. Their past
                              check-ins and customers they invited stay on record for
                              reporting.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => handleDeactivate(c.id)}>
                              Remove
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                  </TableCell>
                )}
              </TableRow>
            ))}
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={isSuperAdmin ? 8 : 7} className="text-center text-muted-foreground">
                  No coaches found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {isSuperAdmin && (
        <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Edit coach</DialogTitle>
            </DialogHeader>
            {editing && (
              <CoachForm
                coach={editing}
                sponsorOptions={sponsorOptions}
                clubOptions={clubOptions}
                onDone={() => {
                  setEditing(null);
                  router.refresh();
                }}
              />
            )}
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
