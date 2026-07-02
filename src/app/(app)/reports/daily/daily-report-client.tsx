"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { addDays, format, parseISO } from "date-fns";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { CONSUMPTION_TYPES } from "@/lib/constants";
import type { ConsumptionType } from "@/lib/types/database";
import { correctCheckinAction, voidCheckinAction, getCheckinHistory } from "./actions";

interface CoachCupRow {
  coach_id: string;
  coach_name: string;
  cups: number;
}

interface BirthdayRow {
  customer_id: string;
  name: string;
  dob: string;
  days_until: number;
}

export interface CheckinRow {
  id: string;
  cups: number;
  consumption_type: ConsumptionType;
  voided: boolean;
  created_at: string;
  customer: { name: string } | null;
}

export interface RenewalRow {
  id: string;
  nc_level: string;
  cups_added: number;
  previous_balance: number;
  new_balance: number;
  created_at: string;
  customer: { name: string } | null;
  renewed_by_coach: { name: string } | null;
}

interface HistoryEntry {
  id: string;
  field_changed: string;
  old_value: string | null;
  new_value: string | null;
  reason: string | null;
  created_at: string;
  editor: { name: string } | null;
}

export function DailyReportClient({
  date,
  clubId,
  clubName,
  viewingBranch,
  isAdmin,
  totals,
  coachCups,
  birthdays,
  checkins,
  renewals,
}: {
  date: string;
  clubId: string;
  clubName: string | null;
  viewingBranch: boolean;
  isAdmin: boolean;
  totals: {
    total_cups: number;
    plugin_cups: number;
    coach_cup_total: number;
    dine_in_cups: number;
    takeaway_cups: number;
  };
  coachCups: CoachCupRow[];
  birthdays: BirthdayRow[];
  checkins: CheckinRow[];
  renewals: RenewalRow[];
}) {
  const router = useRouter();

  function goToDate(d: string) {
    const clubQuery = viewingBranch ? `&club=${clubId}` : "";
    router.push(`/reports/daily?date=${d}${clubQuery}`);
  }

  const parsedDate = parseISO(date);

  return (
    <div className="space-y-6">
      {viewingBranch && (
        <div className="flex items-center justify-between rounded-md border bg-secondary/15 px-4 py-2 text-sm">
          <span>
            Viewing branch <strong>{clubName}</strong> — not merged with your own club.
          </span>
          <Link href="/reports/daily" className="underline underline-offset-4">
            Back to my club
          </Link>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">
          Daily Report{clubName ? ` — ${clubName}` : ""} · {format(parsedDate, "EEEE, d MMM yyyy")}
        </h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => goToDate(format(addDays(parsedDate, -1), "yyyy-MM-dd"))}>
            ← Prev day
          </Button>
          <Input
            type="date"
            className="w-auto"
            value={date}
            onChange={(e) => goToDate(e.target.value)}
          />
          <Button variant="outline" size="sm" onClick={() => goToDate(format(addDays(parsedDate, 1), "yyyy-MM-dd"))}>
            Next day →
          </Button>
        </div>
      </div>

      <Card className="border-2 border-primary bg-primary/5 sm:max-w-xs">
        <CardHeader>
          <CardDescription>Total NC Cups</CardDescription>
          <CardTitle className="text-5xl">{totals.total_cups}</CardTitle>
        </CardHeader>
      </Card>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader>
            <CardDescription>Plug-in Cups</CardDescription>
            <CardTitle className="text-2xl">{totals.plugin_cups}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Dine-in Cups</CardDescription>
            <CardTitle className="text-2xl">{totals.dine_in_cups}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Take-away Cups</CardDescription>
            <CardTitle className="text-2xl">{totals.takeaway_cups}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <div>
        <h2 className="text-lg font-semibold">Coach&apos;s Cup</h2>
        <div className="mt-2 overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Coach</TableHead>
                <TableHead className="text-right">Cups</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {coachCups.map((row) => (
                <TableRow key={row.coach_id}>
                  <TableCell>{row.coach_name}</TableCell>
                  <TableCell className="text-right">{row.cups}</TableCell>
                </TableRow>
              ))}
              {coachCups.length === 0 && (
                <TableRow>
                  <TableCell colSpan={2} className="text-center text-muted-foreground">
                    No qualifying check-ins yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <div>
        <h2 className="text-lg font-semibold">Upcoming birthdays (next 3 days)</h2>
        <div className="mt-2 space-y-1">
          {birthdays.length === 0 && (
            <p className="text-sm text-muted-foreground">No birthdays in the next 3 days.</p>
          )}
          {birthdays.map((b) => (
            <div key={b.customer_id} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
              <span>{b.name}</span>
              <span className="text-muted-foreground">
                {format(parseISO(b.dob), "d MMM")} · {b.days_until === 0 ? "today" : `in ${b.days_until}d`}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h2 className="text-lg font-semibold">Check-ins on this day</h2>
        <div className="mt-2 overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Customer</TableHead>
                <TableHead>Cups</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Time</TableHead>
                <TableHead>Status</TableHead>
                {isAdmin && <TableHead />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {checkins.map((c) => (
                <TableRow key={c.id} className={c.voided ? "opacity-50" : undefined}>
                  <TableCell>{c.customer?.name ?? "—"}</TableCell>
                  <TableCell>{c.cups}</TableCell>
                  <TableCell>{c.consumption_type}</TableCell>
                  <TableCell>{format(new Date(c.created_at), "p")}</TableCell>
                  <TableCell>{c.voided ? <Badge variant="destructive">Voided</Badge> : <Badge variant="secondary">Active</Badge>}</TableCell>
                  {isAdmin && (
                    <TableCell>
                      <ManageCheckinDialog checkin={c} />
                    </TableCell>
                  )}
                </TableRow>
              ))}
              {checkins.length === 0 && (
                <TableRow>
                  <TableCell colSpan={isAdmin ? 6 : 5} className="text-center text-muted-foreground">
                    No check-ins on this day.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <div>
        <h2 className="text-lg font-semibold">Renewals on this day</h2>
        <div className="mt-2 overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Customer</TableHead>
                <TableHead>NC Level</TableHead>
                <TableHead>Cups added</TableHead>
                <TableHead>Balance</TableHead>
                <TableHead>Renewed by</TableHead>
                <TableHead>Time</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {renewals.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>{r.customer?.name ?? "—"}</TableCell>
                  <TableCell>{r.nc_level}</TableCell>
                  <TableCell>+{r.cups_added}</TableCell>
                  <TableCell>
                    {r.previous_balance} → {r.new_balance}
                  </TableCell>
                  <TableCell>{r.renewed_by_coach?.name ?? "—"}</TableCell>
                  <TableCell>{format(new Date(r.created_at), "p")}</TableCell>
                </TableRow>
              ))}
              {renewals.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    No renewals on this day.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}

function ManageCheckinDialog({ checkin }: { checkin: CheckinRow }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [cups, setCups] = useState(checkin.cups);
  const [type, setType] = useState<ConsumptionType>(checkin.consumption_type);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[] | null>(null);

  useEffect(() => {
    if (open) {
      getCheckinHistory(checkin.id).then((res) => {
        if ("data" in res) setHistory(res.data as unknown as HistoryEntry[]);
      });
    }
  }, [open, checkin.id]);

  async function handleSave() {
    if (!reason.trim()) {
      toast.error("Please enter a reason for this correction.");
      return;
    }
    setSaving(true);
    const res = await correctCheckinAction(checkin.id, cups, type, reason.trim());
    setSaving(false);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    toast.success("Check-in corrected.");
    setReason("");
    setOpen(false);
    router.refresh();
  }

  async function handleVoid() {
    if (!reason.trim()) {
      toast.error("Please enter a reason for voiding this check-in.");
      return;
    }
    setSaving(true);
    const res = await voidCheckinAction(checkin.id, reason.trim());
    setSaving(false);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    toast.success("Check-in voided.");
    setReason("");
    setOpen(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" variant="outline" disabled={checkin.voided} />}>
        Manage
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Manage check-in — {checkin.customer?.name}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Cups</Label>
              <Select value={String(cups)} onValueChange={(v) => setCups(Number(v))}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1</SelectItem>
                  <SelectItem value="2">2</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Consumption type</Label>
              <Select value={type} onValueChange={(v) => setType(v as ConsumptionType)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CONSUMPTION_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1">
            <Label>Reason for change *</Label>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. miscounted cups" />
          </div>

          <div className="flex gap-2">
            <Button className="flex-1" onClick={handleSave} disabled={saving}>
              Save correction
            </Button>
            <Button className="flex-1" variant="destructive" onClick={handleVoid} disabled={saving}>
              Void check-in
            </Button>
          </div>

          <Separator />

          <div>
            <h3 className="text-sm font-semibold">Edit history</h3>
            {history === null && <p className="text-xs text-muted-foreground">Loading...</p>}
            {history?.length === 0 && (
              <p className="text-xs text-muted-foreground">No corrections have been made.</p>
            )}
            <ul className="mt-1 space-y-1">
              {history?.map((h) => (
                <li key={h.id} className="text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">{h.editor?.name ?? "Unknown"}</span>{" "}
                  changed {h.field_changed} from &quot;{h.old_value}&quot; to &quot;{h.new_value}&quot;
                  {h.reason ? ` — ${h.reason}` : ""} ({format(new Date(h.created_at), "d MMM p")})
                </li>
              ))}
            </ul>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
