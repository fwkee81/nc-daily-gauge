"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { differenceInYears } from "date-fns";
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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
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
import { CustomerForm } from "./customer-form";
import { RenewDialog } from "./renew-dialog";
import { deactivateCustomer, reactivateCustomer } from "./actions";
import type {
  CustomerGender,
  CustomerNcLevel,
  InvitedByType,
  MemberType,
} from "@/lib/types/database";
import { RENEWAL_REMINDER_THRESHOLD } from "@/lib/constants";

export interface CustomerRow {
  id: string;
  nc_club_id: string;
  name: string;
  gender: CustomerGender;
  contact: string;
  dob: string | null;
  age_override: number | null;
  nc_level: CustomerNcLevel;
  consumption_balance: number;
  invited_by_type: InvitedByType;
  invited_by_coach_id: string | null;
  invited_by_customer_id: string | null;
  coach_id: string | null;
  member_id: string | null;
  member_type: MemberType | null;
  remark: string | null;
  active: boolean;
  invited_by_coach?: { id: string; name: string } | null;
  invited_by_customer?: { id: string; name: string } | null;
  coach?: { id: string; name: string } | null;
}

interface CoachOption {
  id: string;
  name: string;
}

export function CustomersClient({
  initialCustomers,
  coaches,
}: {
  initialCustomers: CustomerRow[];
  coaches: CoachOption[];
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<CustomerRow | null>(null);
  const [renewing, setRenewing] = useState<CustomerRow | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return initialCustomers.filter((c) => {
      if (!showInactive && !c.active) return false;
      if (!q) return true;
      return c.name.toLowerCase().includes(q) || c.contact.toLowerCase().includes(q);
    });
  }, [initialCustomers, search, showInactive]);

  function invitedByLabel(c: CustomerRow) {
    if (c.invited_by_type === "plugin") return "Plug-in";
    if (c.invited_by_type === "coach") return c.invited_by_coach?.name ?? "—";
    return c.invited_by_customer?.name ?? "—";
  }

  function ageOf(c: CustomerRow) {
    if (c.age_override != null) return c.age_override;
    if (!c.dob) return null;
    return differenceInYears(new Date(), new Date(c.dob));
  }

  async function handleDelete(id: string) {
    const result = await deactivateCustomer(id);
    if (result?.error) {
      toast.error(result.error);
    } else {
      toast.success("Customer removed.");
      router.refresh();
    }
  }

  async function handleReactivate(id: string) {
    const result = await reactivateCustomer(id);
    if (result?.error) {
      toast.error(result.error);
    } else {
      toast.success("Customer reactivated.");
      router.refresh();
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Customers</h1>
        <Dialog
          open={dialogOpen}
          onOpenChange={(open) => {
            setDialogOpen(open);
            if (!open) setEditing(null);
          }}
        >
          <DialogTrigger render={<Button onClick={() => setEditing(null)} />}>
            Add customer
          </DialogTrigger>
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>{editing ? "Edit customer" : "Add customer"}</DialogTitle>
            </DialogHeader>
            <CustomerForm
              coaches={coaches}
              customers={initialCustomers}
              editing={editing}
              onDone={() => {
                setDialogOpen(false);
                router.refresh();
              }}
            />
          </DialogContent>
        </Dialog>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-4">
        <Input
          className="max-w-sm"
          placeholder="Search by name or contact..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
          />
          Show inactive customers
        </label>
      </div>

      <div className="mt-4 overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Gender</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead>Age</TableHead>
              <TableHead>NC Level</TableHead>
              <TableHead>Balance</TableHead>
              <TableHead>Invited by</TableHead>
              <TableHead>Coach</TableHead>
              <TableHead>Member</TableHead>
              <TableHead>Remark</TableHead>
              <TableHead>Status</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((c) => (
              <TableRow key={c.id} className={c.active ? undefined : "opacity-60"}>
                <TableCell className="font-medium">{c.name}</TableCell>
                <TableCell>{c.gender}</TableCell>
                <TableCell>{c.contact}</TableCell>
                <TableCell>{ageOf(c) ?? "—"}</TableCell>
                <TableCell>{c.nc_level}</TableCell>
                <TableCell>
                  <Badge variant={c.consumption_balance < RENEWAL_REMINDER_THRESHOLD ? "destructive" : "secondary"}>
                    {c.consumption_balance}
                  </Badge>
                </TableCell>
                <TableCell>{invitedByLabel(c)}</TableCell>
                <TableCell>{c.coach?.name ?? "—"}</TableCell>
                <TableCell>
                  {c.member_id ? `${c.member_id} (${c.member_type ?? "—"})` : "—"}
                </TableCell>
                <TableCell className="max-w-[200px] truncate" title={c.remark ?? undefined}>
                  {c.remark || "—"}
                </TableCell>
                <TableCell>
                  {c.active ? (
                    <Badge variant="secondary">Active</Badge>
                  ) : (
                    <Badge variant="destructive">Inactive</Badge>
                  )}
                </TableCell>
                <TableCell className="flex gap-2">
                  {!c.active && (
                    <Button size="sm" variant="outline" onClick={() => handleReactivate(c.id)}>
                      Reactivate
                    </Button>
                  )}
                  <Button size="sm" variant="outline" onClick={() => setRenewing(c)}>
                    Renew
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setEditing(c);
                      setDialogOpen(true);
                    }}
                  >
                    Edit
                  </Button>
                  {c.active && (
                  <AlertDialog>
                    <AlertDialogTrigger render={<Button size="sm" variant="outline" />}>
                      Remove
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Remove {c.name}?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This hides the customer from check-in and this list. Their past
                          check-in history is kept for reporting. You can ask an admin to
                          restore them directly in the database if needed.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => handleDelete(c.id)}>
                          Remove
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={12} className="text-center text-muted-foreground">
                  No customers found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {renewing && (
        <RenewDialog
          customer={renewing}
          open={!!renewing}
          onOpenChange={(open) => !open && setRenewing(null)}
          onDone={() => {
            setRenewing(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
