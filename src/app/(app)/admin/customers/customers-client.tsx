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
import { deactivateCustomer } from "./actions";
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
  dob: string;
  age_override: number | null;
  nc_level: CustomerNcLevel;
  consumption_balance: number;
  invited_by_type: InvitedByType;
  invited_by_coach_id: string | null;
  invited_by_customer_id: string | null;
  member_id: string | null;
  member_type: MemberType | null;
  invited_by_coach?: { id: string; name: string } | null;
  invited_by_customer?: { id: string; name: string } | null;
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
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<CustomerRow | null>(null);
  const [renewing, setRenewing] = useState<CustomerRow | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return initialCustomers;
    return initialCustomers.filter(
      (c) => c.name.toLowerCase().includes(q) || c.contact.toLowerCase().includes(q)
    );
  }, [initialCustomers, search]);

  function invitedByLabel(c: CustomerRow) {
    if (c.invited_by_type === "plugin") return "Plug-in";
    if (c.invited_by_type === "coach") return c.invited_by_coach?.name ?? "—";
    return c.invited_by_customer?.name ?? "—";
  }

  function ageOf(c: CustomerRow) {
    return c.age_override ?? differenceInYears(new Date(), new Date(c.dob));
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
              <TableHead>Gender</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead>Age</TableHead>
              <TableHead>NC Level</TableHead>
              <TableHead>Balance</TableHead>
              <TableHead>Invited by</TableHead>
              <TableHead>Member</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="font-medium">{c.name}</TableCell>
                <TableCell>{c.gender}</TableCell>
                <TableCell>{c.contact}</TableCell>
                <TableCell>{ageOf(c)}</TableCell>
                <TableCell>{c.nc_level}</TableCell>
                <TableCell>
                  <Badge variant={c.consumption_balance < RENEWAL_REMINDER_THRESHOLD ? "destructive" : "secondary"}>
                    {c.consumption_balance}
                  </Badge>
                </TableCell>
                <TableCell>{invitedByLabel(c)}</TableCell>
                <TableCell>
                  {c.member_id ? `${c.member_id} (${c.member_type ?? "—"})` : "—"}
                </TableCell>
                <TableCell className="flex gap-2">
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
                </TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-muted-foreground">
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
