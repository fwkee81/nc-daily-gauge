"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { addDays, differenceInCalendarDays, format } from "date-fns";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { PaginationBar } from "@/components/ui/pagination-bar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Combobox, type ComboboxOption } from "@/components/combobox";
import type { FriendshipPass, FriendshipPassSource } from "@/lib/types/database";
import { awardFriendshipPasses, voidFriendshipPass } from "./actions";

export type FriendshipPassRow = FriendshipPass & {
  customer: { name: string } | null;
  issued_by_coach: { name: string } | null;
  voided_by_coach: { name: string } | null;
  used_checkin: { customer: { name: string } | null } | null;
};

const SOURCE_LABEL: Record<FriendshipPassSource, string> = {
  pjs: "PJS",
  "30day_upgrade": "30-Day upgrade",
  special: "Special",
};

const SOURCE_DEFAULT_COUNT: Record<FriendshipPassSource, number | null> = {
  pjs: 3,
  "30day_upgrade": 2,
  special: null,
};

const PASSES_PAGE_SIZE = 20;

function fmtDate(iso: string) {
  return format(new Date(iso), "d MMM yyyy");
}

type PassStatus = "active" | "used" | "voided" | "expired";

function statusOf(pass: FriendshipPassRow): PassStatus {
  if (pass.voided) return "voided";
  if (pass.used_at) return "used";
  if (differenceInCalendarDays(new Date(pass.expires_at), new Date()) < 0) return "expired";
  return "active";
}

const STATUS_BADGE: Record<PassStatus, { label: string; variant: "default" | "secondary" | "destructive" }> = {
  active: { label: "Active", variant: "default" },
  used: { label: "Used", variant: "secondary" },
  voided: { label: "Voided", variant: "destructive" },
  expired: { label: "Expired", variant: "destructive" },
};

export function FriendshipPassClient({
  passes,
  customers,
}: {
  passes: FriendshipPassRow[];
  customers: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [awarding, setAwarding] = useState(false);
  const [voiding, setVoiding] = useState<FriendshipPassRow | null>(null);
  const [page, setPage] = useState(1);

  const customerOptions: ComboboxOption[] = customers.map((c) => ({ value: c.id, label: c.name }));

  // Active-and-soonest-expiring first — the whole point of this page is to
  // see who needs a nudge before their pass goes to waste.
  const sorted = useMemo(() => {
    const statusRank: Record<PassStatus, number> = { active: 0, expired: 1, used: 2, voided: 3 };
    return [...passes].sort((a, b) => {
      const ra = statusRank[statusOf(a)];
      const rb = statusRank[statusOf(b)];
      if (ra !== rb) return ra - rb;
      return a.expires_at.localeCompare(b.expires_at);
    });
  }, [passes]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return sorted;
    return sorted.filter((p) => (p.customer?.name ?? "").toLowerCase().includes(q));
  }, [sorted, search]);

  const summary = useMemo(() => {
    const byCustomer = new Map<string, { name: string; count: number; soonestExpiresAt: string }>();
    for (const p of passes) {
      if (statusOf(p) !== "active") continue;
      const name = p.customer?.name ?? "Unknown";
      const existing = byCustomer.get(p.customer_id);
      if (!existing) {
        byCustomer.set(p.customer_id, { name, count: 1, soonestExpiresAt: p.expires_at });
      } else {
        existing.count += 1;
        if (p.expires_at < existing.soonestExpiresAt) existing.soonestExpiresAt = p.expires_at;
      }
    }
    return [...byCustomer.values()].sort((a, b) => a.soonestExpiresAt.localeCompare(b.soonestExpiresAt));
  }, [passes]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PASSES_PAGE_SIZE));
  const pageSafe = Math.min(page, pageCount);
  const paged = filtered.slice((pageSafe - 1) * PASSES_PAGE_SIZE, pageSafe * PASSES_PAGE_SIZE);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Friendship Pass</h1>
        <Button size="sm" onClick={() => setAwarding(true)}>
          Award Friendship Pass
        </Button>
      </div>

      <div>
        <h2 className="text-lg font-semibold">Who has active passes</h2>
        <div className="mt-2 overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Customer</TableHead>
                <TableHead className="text-right">Active passes</TableHead>
                <TableHead>Nearest expiry</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {summary.map((s) => {
                const daysLeft = differenceInCalendarDays(new Date(s.soonestExpiresAt), new Date());
                return (
                  <TableRow key={s.name}>
                    <TableCell className="font-medium">{s.name}</TableCell>
                    <TableCell className="text-right">
                      <Badge variant="secondary">{s.count}</Badge>
                    </TableCell>
                    <TableCell className={cn(daysLeft <= 14 && "font-medium text-destructive")}>
                      {fmtDate(s.soonestExpiresAt)} ({daysLeft}d left)
                    </TableCell>
                  </TableRow>
                );
              })}
              {summary.length === 0 && (
                <TableRow>
                  <TableCell colSpan={3} className="text-center text-muted-foreground">
                    Nobody currently holds an active Friendship Pass.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <div>
        <h2 className="text-lg font-semibold">All passes</h2>
        <Input
          className="mt-2 max-w-sm"
          placeholder="Search by name..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
        <div className="mt-2 overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Customer</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Issued by</TableHead>
                <TableHead>Issued</TableHead>
                <TableHead>Expires</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Used by</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {paged.map((p) => {
                const status = statusOf(p);
                const badge = STATUS_BADGE[status];
                return (
                  <TableRow key={p.id} className={status === "voided" ? "opacity-50" : undefined}>
                    <TableCell className="font-medium">{p.customer?.name ?? "—"}</TableCell>
                    <TableCell>{SOURCE_LABEL[p.source]}</TableCell>
                    <TableCell className="max-w-[200px] truncate" title={p.reason}>
                      {p.reason}
                    </TableCell>
                    <TableCell>{p.issued_by_coach?.name ?? "—"}</TableCell>
                    <TableCell className="whitespace-nowrap">{fmtDate(p.issued_at)}</TableCell>
                    <TableCell className="whitespace-nowrap">{fmtDate(p.expires_at)}</TableCell>
                    <TableCell>
                      <Badge variant={badge.variant}>{badge.label}</Badge>
                      {status === "voided" && p.void_reason && (
                        <span className="ml-1 text-xs text-muted-foreground">— {p.void_reason}</span>
                      )}
                    </TableCell>
                    <TableCell>{status === "used" ? p.used_checkin?.customer?.name ?? "—" : "—"}</TableCell>
                    <TableCell>
                      {status === "active" && (
                        <Button size="sm" variant="outline" onClick={() => setVoiding(p)}>
                          Void
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-muted-foreground">
                    No Friendship Passes found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          <PaginationBar
            page={pageSafe}
            pageCount={pageCount}
            totalItems={filtered.length}
            pageSize={PASSES_PAGE_SIZE}
            onPageChange={setPage}
          />
        </div>
      </div>

      {awarding && (
        <AwardDialog
          customerOptions={customerOptions}
          open={awarding}
          onOpenChange={setAwarding}
          onDone={() => {
            setAwarding(false);
            router.refresh();
          }}
        />
      )}

      {voiding && (
        <VoidDialog
          pass={voiding}
          open={!!voiding}
          onOpenChange={(open) => !open && setVoiding(null)}
          onDone={() => {
            setVoiding(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function AwardDialog({
  customerOptions,
  open,
  onOpenChange,
  onDone,
}: {
  customerOptions: ComboboxOption[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
}) {
  const defaultExpiresAt = format(addDays(new Date(), 90), "yyyy-MM-dd");
  const todayStr = format(new Date(), "yyyy-MM-dd");

  const [customerId, setCustomerId] = useState<string | null>(null);
  const [source, setSource] = useState<FriendshipPassSource>("pjs");
  const [customCount, setCustomCount] = useState("");
  const [reason, setReason] = useState("");
  const [showExpiryOverride, setShowExpiryOverride] = useState(false);
  const [expiresAt, setExpiresAt] = useState(defaultExpiresAt);
  const [isPending, setIsPending] = useState(false);

  const defaultCount = SOURCE_DEFAULT_COUNT[source];
  const isCustomCount = defaultCount === null;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!customerId) {
      toast.error("Choose a customer.");
      return;
    }
    const count = isCustomCount ? Number(customCount) : defaultCount;
    if (!Number.isInteger(count) || count! < 1 || count! > 20) {
      toast.error("Count must be a whole number between 1 and 20.");
      return;
    }
    if (!reason.trim()) {
      toast.error("Enter a reason.");
      return;
    }
    if (showExpiryOverride && expiresAt < todayStr) {
      toast.error("Expiry date must be today or later.");
      return;
    }
    setIsPending(true);
    const result = await awardFriendshipPasses(
      customerId,
      source,
      count!,
      reason.trim(),
      showExpiryOverride ? expiresAt : null
    );
    setIsPending(false);

    if (result?.error) {
      toast.error(result.error);
      return;
    }
    toast.success(`${count} Friendship Pass${count === 1 ? "" : "es"} awarded.`);
    onDone();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Award Friendship Pass</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <Label>Customer *</Label>
            <Combobox
              options={customerOptions}
              value={customerId}
              onChange={setCustomerId}
              placeholder="Select customer..."
              searchPlaceholder="Search customers..."
            />
          </div>

          <div className="space-y-1">
            <Label>Source *</Label>
            <Select value={source} onValueChange={(v) => v && setSource(v as FriendshipPassSource)}>
              <SelectTrigger className="w-full">
                <SelectValue>{SOURCE_LABEL[source]}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pjs">PJS — 3 passes</SelectItem>
                <SelectItem value="30day_upgrade">30-Day upgrade — 2 passes</SelectItem>
                <SelectItem value="special">Special — custom count</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {isCustomCount ? (
            <div className="space-y-1">
              <Label>Count *</Label>
              <Input
                type="number"
                min={1}
                max={20}
                value={customCount}
                onChange={(e) => setCustomCount(e.target.value)}
                required
              />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Issues {defaultCount} passes.</p>
          )}

          <div>
            {!showExpiryOverride ? (
              <button
                type="button"
                className="text-sm text-muted-foreground underline underline-offset-4"
                onClick={() => setShowExpiryOverride(true)}
              >
                Expires {format(new Date(`${defaultExpiresAt}T00:00:00`), "d MMM yyyy")} (90 days) —
                change expiry date
              </button>
            ) : (
              <div className="space-y-1">
                <Label>Expiry date</Label>
                <Input
                  type="date"
                  min={todayStr}
                  value={expiresAt}
                  onChange={(e) => setExpiresAt(e.target.value)}
                />
              </div>
            )}
          </div>

          <div className="space-y-1">
            <Label>Reason *</Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={source === "pjs" ? "e.g. New PJS sign-up" : "e.g. Hit first 30-Day upgrade"}
              rows={2}
              required
            />
          </div>

          <Button type="submit" disabled={isPending} className="w-full">
            {isPending ? "Awarding..." : "Award"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function VoidDialog({
  pass,
  open,
  onOpenChange,
  onDone,
}: {
  pass: FriendshipPassRow;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
}) {
  const [reason, setReason] = useState("");
  const [isPending, setIsPending] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!reason.trim()) {
      toast.error("Enter a reason for voiding this pass.");
      return;
    }
    setIsPending(true);
    const result = await voidFriendshipPass(pass.id, reason.trim());
    setIsPending(false);

    if (result?.error) {
      toast.error(result.error);
      return;
    }
    toast.success("Friendship Pass voided.");
    onDone();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Void this pass — {pass.customer?.name}?</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <p className="text-sm text-muted-foreground">
            This can&apos;t be undone. The pass will no longer be usable on a walk-in check-in.
          </p>
          <div className="space-y-1">
            <Label>Reason *</Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Awarded to the wrong customer by mistake"
              rows={2}
              required
            />
          </div>
          <Button type="submit" disabled={isPending} className="w-full">
            {isPending ? "Voiding..." : "Void pass"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
