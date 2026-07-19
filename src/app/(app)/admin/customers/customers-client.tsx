"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { differenceInYears } from "date-fns";
import { ArrowDown, ArrowUp, ArrowUpDown, Download } from "lucide-react";
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
import { cn } from "@/lib/utils";
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
  is_pjs: boolean;
  is_health_ambassador: boolean;
  active: boolean;
  invited_by_coach?: { id: string; name: string } | null;
  invited_by_customer?: { id: string; name: string } | null;
  coach?: { id: string; name: string } | null;
}

interface CoachOption {
  id: string;
  name: string;
}

export interface CustomerMemberRow {
  id: string;
  customer_id: string;
  name: string;
  contact: string | null;
  dob: string | null;
  active: boolean;
}

type SortKey =
  | "name"
  | "gender"
  | "contact"
  | "age"
  | "nc_level"
  | "balance"
  | "invited_by"
  | "coach"
  | "member"
  | "remark"
  | "status";

const NC_LEVEL_LABEL: Record<string, string> = {
  "5-day": "5-Day",
  "10-day": "10-Day",
  "20-day": "20-Day",
  "30-day": "30-Day",
};

const CONFETTI_COLORS = [
  "#9ec835",
  "#ffbd59",
  "#ff6b6b",
  "#4dabf7",
  "#f06595",
  "#9ec835",
  "#ffbd59",
  "#4dabf7",
];

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

function sortValue(c: CustomerRow, key: SortKey): string | number {
  switch (key) {
    case "name":
      return c.name.toLowerCase();
    case "gender":
      return c.gender;
    case "contact":
      return c.contact;
    case "age":
      return ageOf(c) ?? -1;
    case "nc_level":
      return c.nc_level;
    case "balance":
      return c.consumption_balance;
    case "invited_by":
      return invitedByLabel(c).toLowerCase();
    case "coach":
      return c.coach?.name?.toLowerCase() ?? "";
    case "member":
      return c.member_id?.toLowerCase() ?? "";
    case "remark":
      return c.remark?.toLowerCase() ?? "";
    case "status":
      return c.active ? 1 : 0;
  }
}

function SortableHead({
  label,
  active,
  direction,
  onClick,
  className,
}: {
  label: string;
  active: boolean;
  direction: "asc" | "desc";
  onClick: () => void;
  className?: string;
}) {
  return (
    <TableHead
      className={cn("cursor-pointer select-none whitespace-nowrap hover:text-foreground", className)}
      onClick={onClick}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {active ? (
          direction === "asc" ? (
            <ArrowUp className="size-3" />
          ) : (
            <ArrowDown className="size-3" />
          )
        ) : (
          <ArrowUpDown className="size-3 opacity-30" />
        )}
      </span>
    </TableHead>
  );
}

export function CustomersClient({
  initialCustomers,
  coaches,
  members,
  viewingBranch,
  clubName,
}: {
  initialCustomers: CustomerRow[];
  coaches: CoachOption[];
  members: CustomerMemberRow[];
  viewingBranch: boolean;
  clubName: string | null;
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<CustomerRow | null>(null);
  const [renewing, setRenewing] = useState<CustomerRow | null>(null);
  const [viewing, setViewing] = useState<CustomerRow | null>(null);
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" } | null>(null);
  const [newSignup, setNewSignup] = useState<{ name: string; ncLevel: CustomerNcLevel } | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return initialCustomers.filter((c) => {
      if (!showInactive && !c.active) return false;
      if (!q) return true;
      return c.name.toLowerCase().includes(q) || c.contact.toLowerCase().includes(q);
    });
  }, [initialCustomers, search, showInactive]);

  const sorted = useMemo(() => {
    if (!sort) return filtered;
    const { key, dir } = sort;
    const result = [...filtered].sort((a, b) => {
      const av = sortValue(a, key);
      const bv = sortValue(b, key);
      if (av < bv) return -1;
      if (av > bv) return 1;
      return 0;
    });
    return dir === "asc" ? result : result.reverse();
  }, [filtered, sort]);

  function toggleSort(key: SortKey) {
    setSort((current) => {
      if (current?.key === key) {
        return { key, dir: current.dir === "asc" ? "desc" : "asc" };
      }
      return { key, dir: "asc" };
    });
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
      {viewingBranch && (
        <div className="mb-4 flex items-center justify-between rounded-md border bg-secondary/15 px-4 py-2 text-sm">
          <span>
            Viewing branch <strong>{clubName}</strong> — read-only, not merged with your own club.
          </span>
          <Link href="/admin/customers" className="underline underline-offset-4">
            Back to my club
          </Link>
        </div>
      )}

      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Customers</h1>
        {!viewingBranch && (
          <div className="flex items-center gap-2">
            <a
              href="/api/export/customers"
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 text-sm font-medium transition-all hover:bg-muted"
            >
              <Download className="size-4" /> Export to Excel
            </a>
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
                members={editing ? members.filter((m) => m.customer_id === editing.id) : []}
                onDone={(celebration) => {
                  setDialogOpen(false);
                  router.refresh();
                  if (celebration) setNewSignup(celebration);
                }}
              />
            </DialogContent>
            </Dialog>
          </div>
        )}
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
              <SortableHead
                label="Name"
                active={sort?.key === "name"}
                direction={sort?.dir ?? "asc"}
                onClick={() => toggleSort("name")}
                className="sticky left-0 z-20 border-r bg-background"
              />
              <SortableHead
                label="Gender"
                active={sort?.key === "gender"}
                direction={sort?.dir ?? "asc"}
                onClick={() => toggleSort("gender")}
              />
              <SortableHead
                label="Contact"
                active={sort?.key === "contact"}
                direction={sort?.dir ?? "asc"}
                onClick={() => toggleSort("contact")}
              />
              <SortableHead
                label="Age"
                active={sort?.key === "age"}
                direction={sort?.dir ?? "asc"}
                onClick={() => toggleSort("age")}
              />
              <SortableHead
                label="NC Level"
                active={sort?.key === "nc_level"}
                direction={sort?.dir ?? "asc"}
                onClick={() => toggleSort("nc_level")}
              />
              <SortableHead
                label="Balance"
                active={sort?.key === "balance"}
                direction={sort?.dir ?? "asc"}
                onClick={() => toggleSort("balance")}
              />
              <SortableHead
                label="Invited by"
                active={sort?.key === "invited_by"}
                direction={sort?.dir ?? "asc"}
                onClick={() => toggleSort("invited_by")}
              />
              <SortableHead
                label="Coach"
                active={sort?.key === "coach"}
                direction={sort?.dir ?? "asc"}
                onClick={() => toggleSort("coach")}
              />
              <SortableHead
                label="Member"
                active={sort?.key === "member"}
                direction={sort?.dir ?? "asc"}
                onClick={() => toggleSort("member")}
              />
              <SortableHead
                label="Remark"
                active={sort?.key === "remark"}
                direction={sort?.dir ?? "asc"}
                onClick={() => toggleSort("remark")}
              />
              <SortableHead
                label="Status"
                active={sort?.key === "status"}
                direction={sort?.dir ?? "asc"}
                onClick={() => toggleSort("status")}
              />
              <TableHead>Tags</TableHead>
              {!viewingBranch && <TableHead />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((c) => (
              <TableRow key={c.id} className={c.active ? undefined : "opacity-60"}>
                <TableCell className="sticky left-0 z-10 border-r bg-background font-medium">
                  <Button
                    variant="link"
                    className="h-auto p-0 font-medium"
                    onClick={() => setViewing(c)}
                  >
                    {c.name}
                  </Button>
                </TableCell>
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
                <TableCell>
                  <div className="flex gap-1">
                    {c.is_pjs && <Badge variant="outline">PJS</Badge>}
                    {c.is_health_ambassador && <Badge variant="outline">HA</Badge>}
                  </div>
                </TableCell>
                {!viewingBranch && (
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
                )}
              </TableRow>
            ))}
            {sorted.length === 0 && (
              <TableRow>
                <TableCell colSpan={viewingBranch ? 12 : 13} className="text-center text-muted-foreground">
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

      <CustomerViewDialog
        customer={viewing}
        members={viewing ? members.filter((m) => m.customer_id === viewing.id) : []}
        onOpenChange={(open) => !open && setViewing(null)}
      />

      <Dialog open={!!newSignup} onOpenChange={(open) => !open && setNewSignup(null)}>
        <DialogContent className="overflow-hidden sm:max-w-sm">
          {CONFETTI_COLORS.map((color, i) => (
            <span
              key={i}
              aria-hidden
              className="pointer-events-none absolute top-0 h-2.5 w-2.5 rounded-sm"
              style={{
                left: `${(i * 13 + 5) % 100}%`,
                backgroundColor: color,
                animation: "confetti-fall 1.8s ease-in forwards",
                animationDelay: `${(i % 6) * 0.15}s`,
              }}
            />
          ))}
          <DialogHeader>
            <DialogTitle className="text-center text-2xl">🎉 Congratulations! 🎉</DialogTitle>
          </DialogHeader>
          {newSignup && (
            <div className="flex flex-col items-center gap-2 py-2 text-center">
              <span
                className="text-6xl"
                style={{ display: "inline-block", animation: "cake-bounce 1s ease-in-out infinite" }}
              >
                🎊
              </span>
              <p className="text-xl font-semibold">{newSignup.name}</p>
              <p className="text-base text-muted-foreground">
                Just signed up for the {NC_LEVEL_LABEL[newSignup.ncLevel] ?? newSignup.ncLevel}{" "}
                package — great work!
              </p>
            </div>
          )}
          <Button className="w-full py-6 text-lg" onClick={() => setNewSignup(null)}>
            OK
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CustomerViewDialog({
  customer,
  members,
  onOpenChange,
}: {
  customer: CustomerRow | null;
  members: CustomerMemberRow[];
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={!!customer} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{customer?.name}</DialogTitle>
        </DialogHeader>

        {customer && (
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-x-4 gap-y-2">
              <div>
                <p className="text-xs text-muted-foreground">Gender</p>
                <p>{customer.gender}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Contact</p>
                <p>{customer.contact}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Age</p>
                <p>{ageOf(customer) ?? "—"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">NC Level</p>
                <p>{customer.nc_level}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Consumption balance</p>
                <p>{customer.consumption_balance}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Invited by</p>
                <p>{invitedByLabel(customer)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Coach</p>
                <p>{customer.coach?.name ?? "—"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Member</p>
                <p>
                  {customer.member_id
                    ? `${customer.member_id} (${customer.member_type ?? "—"})`
                    : "—"}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Status</p>
                <p>{customer.active ? "Active" : "Inactive"}</p>
              </div>
            </div>

            {(customer.is_pjs || customer.is_health_ambassador) && (
              <div className="flex gap-1.5">
                {customer.is_pjs && <Badge variant="outline">PJS</Badge>}
                {customer.is_health_ambassador && <Badge variant="outline">Health Ambassador</Badge>}
              </div>
            )}

            <div>
              <p className="text-xs text-muted-foreground">Remark</p>
              <p>{customer.remark || "—"}</p>
            </div>

            {members.length > 0 && (
              <div>
                <p className="text-xs text-muted-foreground">Shares account with</p>
                <ul className="mt-1 space-y-0.5">
                  {members.map((m) => (
                    <li key={m.id}>
                      {m.name}
                      {m.contact && <span className="text-muted-foreground"> · {m.contact}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
