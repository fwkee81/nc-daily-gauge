"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
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
import type { CustomerNcLevel, LoyaltyEarnRule, LoyaltyPointsLedgerEntry, LoyaltyReward, LoyaltySettings } from "@/lib/types/database";
import {
  awardLoyaltyPoints,
  createLoyaltyEarnRule,
  createLoyaltyReward,
  deleteLoyaltyEarnRule,
  deleteLoyaltyReward,
  redeemLoyaltyReward,
  setLoyaltyEarnRuleActive,
  setLoyaltyRewardActive,
  updateLoyaltyEarnRule,
  updateLoyaltyReward,
  upsertLoyaltySettings,
  voidLoyaltyRedemption,
} from "./actions";

export interface LoyaltyCustomerRow {
  id: string;
  name: string;
  nc_level: CustomerNcLevel;
  loyalty_points_balance: number;
}

const NC_LEVEL_LABEL: Record<string, string> = {
  "10-day": "10-Day",
  "20-day": "20-Day",
  "30-day": "30-Day",
};

const KIND_LABEL: Record<string, string> = {
  checkin: "Check-in",
  adjustment: "Adjustment",
  manual: "Bonus",
  redeem: "Redeemed",
};

function fmt(iso: string) {
  return format(new Date(iso), "d MMM, h:mma");
}

export function LoyaltyClient({
  isAdmin,
  settings,
  earnRules,
  rewards,
  customers,
  recentActivity,
}: {
  isAdmin: boolean;
  settings: LoyaltySettings | null;
  earnRules: LoyaltyEarnRule[];
  rewards: LoyaltyReward[];
  customers: LoyaltyCustomerRow[];
  recentActivity: (LoyaltyPointsLedgerEntry & { customer: { name: string } | null })[];
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [awarding, setAwarding] = useState<LoyaltyCustomerRow | null>(null);
  const [redeeming, setRedeeming] = useState<LoyaltyCustomerRow | null>(null);
  const [voiding, setVoiding] = useState<LoyaltyPointsLedgerEntry | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter((c) => c.name.toLowerCase().includes(q));
  }, [customers, search]);

  const enabled = settings?.enabled ?? false;

  if (!enabled && !isAdmin) {
    return (
      <div>
        <h1 className="text-2xl font-semibold">Loyalty Program</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          The Loyalty Program isn&apos;t turned on for your club yet — ask your club Owner to enable it.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Loyalty Program</h1>
        {isAdmin && (
          <Button variant="outline" size="sm" onClick={() => setShowSettings((v) => !v)}>
            {showSettings ? "Hide settings" : "Settings"}
          </Button>
        )}
      </div>

      {isAdmin && showSettings && (
        <SettingsPanel
          settings={settings}
          earnRules={earnRules}
          rewards={rewards}
          onDone={() => router.refresh()}
        />
      )}

      {!enabled ? (
        <div className="rounded-md border bg-secondary/15 p-4 text-sm">
          Loyalty Program is currently off for your club. Turn it on in Settings above to start
          earning and redeeming points — nothing is tracked while it&apos;s off.
        </div>
      ) : (
        <>
          <div>
            <Input
              className="max-w-sm"
              placeholder="Search by name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <div className="mt-4 overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>NC Level</TableHead>
                    <TableHead className="text-right">Points</TableHead>
                    {isAdmin && <TableHead />}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">{c.name}</TableCell>
                      <TableCell>{NC_LEVEL_LABEL[c.nc_level] ?? c.nc_level}</TableCell>
                      <TableCell className="text-right">
                        <Badge variant="secondary">{c.loyalty_points_balance}</Badge>
                      </TableCell>
                      {isAdmin && (
                        <TableCell className="flex justify-end gap-2">
                          <Button size="sm" variant="outline" onClick={() => setAwarding(c)}>
                            Add LP
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => setRedeeming(c)}>
                            Redeem
                          </Button>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                  {filtered.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={isAdmin ? 4 : 3} className="text-center text-muted-foreground">
                        No eligible customers found. Only 10-Day/20-Day/30-Day customers join the
                        Loyalty Program.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>

          <div>
            <h2 className="text-lg font-semibold">Recent activity</h2>
            <div className="mt-2 overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>When</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Note</TableHead>
                    <TableHead className="text-right">Points</TableHead>
                    {isAdmin && <TableHead />}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentActivity.map((entry) => (
                    <TableRow key={entry.id} className={entry.voided ? "opacity-50" : undefined}>
                      <TableCell className="whitespace-nowrap text-muted-foreground">{fmt(entry.created_at)}</TableCell>
                      <TableCell>{entry.customer?.name ?? "—"}</TableCell>
                      <TableCell>{KIND_LABEL[entry.kind] ?? entry.kind}</TableCell>
                      <TableCell className="max-w-[240px] truncate text-muted-foreground" title={entry.reason ?? undefined}>
                        {entry.voided ? `Voided — ${entry.void_reason}` : entry.reason || "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        {entry.points > 0 ? `+${entry.points}` : entry.points}
                      </TableCell>
                      {isAdmin && (
                        <TableCell className="text-right">
                          {entry.kind === "redeem" && !entry.voided && (
                            <Button size="sm" variant="outline" onClick={() => setVoiding(entry)}>
                              Void
                            </Button>
                          )}
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                  {recentActivity.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={isAdmin ? 6 : 5} className="text-center text-muted-foreground">
                        No activity yet.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </>
      )}

      {awarding && (
        <AwardPointsDialog
          customer={awarding}
          earnRules={earnRules.filter((r) => r.active)}
          open={!!awarding}
          onOpenChange={(open) => !open && setAwarding(null)}
          onDone={() => {
            setAwarding(null);
            router.refresh();
          }}
        />
      )}

      {redeeming && (
        <RedeemDialog
          customer={redeeming}
          rewards={rewards.filter((r) => r.active)}
          open={!!redeeming}
          onOpenChange={(open) => !open && setRedeeming(null)}
          onDone={() => {
            setRedeeming(null);
            router.refresh();
          }}
        />
      )}

      {voiding && (
        <VoidRedemptionDialog
          entry={voiding}
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

function SettingsPanel({
  settings,
  earnRules,
  rewards,
  onDone,
}: {
  settings: LoyaltySettings | null;
  earnRules: LoyaltyEarnRule[];
  rewards: LoyaltyReward[];
  onDone: () => void;
}) {
  const [enabled, setEnabled] = useState(settings?.enabled ?? false);
  const [pointsPerCup, setPointsPerCup] = useState(String(settings?.points_per_cup ?? 0));
  const [savingSettings, setSavingSettings] = useState(false);

  const [newRuleLabel, setNewRuleLabel] = useState("");
  const [newRulePoints, setNewRulePoints] = useState("");
  const [addingRule, setAddingRule] = useState(false);

  const [newRewardName, setNewRewardName] = useState("");
  const [newRewardCost, setNewRewardCost] = useState("");
  const [addingReward, setAddingReward] = useState(false);

  async function handleSaveSettings() {
    const value = Number(pointsPerCup);
    if (!Number.isInteger(value) || value < 0) {
      toast.error("Points per cup must be a whole number, 0 or more.");
      return;
    }
    setSavingSettings(true);
    const result = await upsertLoyaltySettings(enabled, value);
    setSavingSettings(false);
    if (result?.error) {
      toast.error(result.error);
      return;
    }
    toast.success("Loyalty Program settings saved.");
    onDone();
  }

  async function handleAddRule() {
    const points = Number(newRulePoints);
    if (!newRuleLabel.trim()) {
      toast.error("Enter a label for this earn rule.");
      return;
    }
    if (!Number.isInteger(points) || points <= 0) {
      toast.error("Points must be a whole number greater than 0.");
      return;
    }
    setAddingRule(true);
    const result = await createLoyaltyEarnRule(newRuleLabel.trim(), points);
    setAddingRule(false);
    if (result?.error) {
      toast.error(result.error);
      return;
    }
    setNewRuleLabel("");
    setNewRulePoints("");
    toast.success("Earn rule added.");
    onDone();
  }

  async function handleToggleRule(id: string, active: boolean) {
    const result = await setLoyaltyEarnRuleActive(id, active);
    if (result?.error) {
      toast.error(result.error);
      return;
    }
    onDone();
  }

  async function handleAddReward() {
    const cost = Number(newRewardCost);
    if (!newRewardName.trim()) {
      toast.error("Enter a name for this reward.");
      return;
    }
    if (!Number.isInteger(cost) || cost <= 0) {
      toast.error("Points cost must be a whole number greater than 0.");
      return;
    }
    setAddingReward(true);
    const result = await createLoyaltyReward(newRewardName.trim(), cost);
    setAddingReward(false);
    if (result?.error) {
      toast.error(result.error);
      return;
    }
    setNewRewardName("");
    setNewRewardCost("");
    toast.success("Reward added.");
    onDone();
  }

  async function handleToggleReward(id: string, active: boolean) {
    const result = await setLoyaltyRewardActive(id, active);
    if (result?.error) {
      toast.error(result.error);
      return;
    }
    onDone();
  }

  return (
    <div className="space-y-6 rounded-md border p-4">
      <div>
        <p className="text-sm font-semibold">Program status</p>
        <div className="mt-2 flex flex-wrap items-end gap-4">
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={enabled} onCheckedChange={setEnabled} />
            {enabled ? "On" : "Off"}
          </label>
          <div className="space-y-1">
            <Label>Points per cup</Label>
            <Input
              type="number"
              min={0}
              className="w-32"
              value={pointsPerCup}
              onChange={(e) => setPointsPerCup(e.target.value)}
            />
          </div>
          <Button size="sm" disabled={savingSettings} onClick={handleSaveSettings}>
            {savingSettings ? "Saving..." : "Save"}
          </Button>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Only 10-Day/20-Day/30-Day customers earn points, and only when this is on. Points always
          equal cups checked in × the rate above.
        </p>
      </div>

      <div>
        <p className="text-sm font-semibold">Earn rules (for manual bonus points)</p>
        <ul className="mt-2 space-y-1">
          {earnRules.map((r) => (
            <EarnRuleRow key={r.id} rule={r} onToggle={(v) => handleToggleRule(r.id, v)} onDone={onDone} />
          ))}
          {earnRules.length === 0 && <p className="text-sm text-muted-foreground">No earn rules yet.</p>}
        </ul>
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <Label>Label</Label>
            <Input
              className="w-48"
              value={newRuleLabel}
              onChange={(e) => setNewRuleLabel(e.target.value)}
              placeholder="e.g. Referral"
            />
          </div>
          <div className="space-y-1">
            <Label>Points</Label>
            <Input
              type="number"
              min={1}
              className="w-24"
              value={newRulePoints}
              onChange={(e) => setNewRulePoints(e.target.value)}
            />
          </div>
          <Button size="sm" variant="outline" disabled={addingRule} onClick={handleAddRule}>
            {addingRule ? "Adding..." : "Add rule"}
          </Button>
        </div>
      </div>

      <div>
        <p className="text-sm font-semibold">Rewards catalog</p>
        <ul className="mt-2 space-y-1">
          {rewards.map((r) => (
            <RewardRow key={r.id} reward={r} onToggle={(v) => handleToggleReward(r.id, v)} onDone={onDone} />
          ))}
          {rewards.length === 0 && <p className="text-sm text-muted-foreground">No rewards yet.</p>}
        </ul>
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <Label>Name</Label>
            <Input
              className="w-48"
              value={newRewardName}
              onChange={(e) => setNewRewardName(e.target.value)}
              placeholder="e.g. RM10 Voucher"
            />
          </div>
          <div className="space-y-1">
            <Label>Points cost</Label>
            <Input
              type="number"
              min={1}
              className="w-24"
              value={newRewardCost}
              onChange={(e) => setNewRewardCost(e.target.value)}
            />
          </div>
          <Button size="sm" variant="outline" disabled={addingReward} onClick={handleAddReward}>
            {addingReward ? "Adding..." : "Add reward"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function EarnRuleRow({
  rule,
  onToggle,
  onDone,
}: {
  rule: LoyaltyEarnRule;
  onToggle: (active: boolean) => void;
  onDone: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(rule.label);
  const [points, setPoints] = useState(String(rule.points));
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    const p = Number(points);
    if (!label.trim()) {
      toast.error("Label can't be empty.");
      return;
    }
    if (!Number.isInteger(p) || p <= 0) {
      toast.error("Points must be a whole number greater than 0.");
      return;
    }
    setSaving(true);
    const result = await updateLoyaltyEarnRule(rule.id, label.trim(), p);
    setSaving(false);
    if (result?.error) {
      toast.error(result.error);
      return;
    }
    setEditing(false);
    onDone();
  }

  async function handleDelete() {
    const result = await deleteLoyaltyEarnRule(rule.id);
    if (result?.error) {
      toast.error(result.error);
      return;
    }
    onDone();
  }

  if (editing) {
    return (
      <li className="flex flex-wrap items-center gap-2 rounded-md border px-3 py-1.5 text-sm">
        <Input className="w-40" value={label} onChange={(e) => setLabel(e.target.value)} />
        <Input
          type="number"
          min={1}
          className="w-20"
          value={points}
          onChange={(e) => setPoints(e.target.value)}
        />
        <Button size="sm" disabled={saving} onClick={handleSave}>
          {saving ? "Saving..." : "Save"}
        </Button>
        <Button size="sm" variant="outline" onClick={() => setEditing(false)}>
          Cancel
        </Button>
      </li>
    );
  }

  return (
    <li className="flex items-center justify-between rounded-md border px-3 py-1.5 text-sm">
      <span className={rule.active ? undefined : "text-muted-foreground line-through"}>
        {rule.label} — {rule.points} pts
      </span>
      <div className="flex items-center gap-2">
        <Switch checked={rule.active} onCheckedChange={onToggle} />
        <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
          Edit
        </Button>
        <AlertDialog>
          <AlertDialogTrigger render={<Button size="sm" variant="outline" />}>Delete</AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete &quot;{rule.label}&quot;?</AlertDialogTitle>
              <AlertDialogDescription>
                This can&apos;t be undone. If it&apos;s already been used to award points, deleting will
                fail — turn it off instead in that case.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </li>
  );
}

function RewardRow({
  reward,
  onToggle,
  onDone,
}: {
  reward: LoyaltyReward;
  onToggle: (active: boolean) => void;
  onDone: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(reward.name);
  const [pointsCost, setPointsCost] = useState(String(reward.points_cost));
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    const cost = Number(pointsCost);
    if (!name.trim()) {
      toast.error("Name can't be empty.");
      return;
    }
    if (!Number.isInteger(cost) || cost <= 0) {
      toast.error("Points cost must be a whole number greater than 0.");
      return;
    }
    setSaving(true);
    const result = await updateLoyaltyReward(reward.id, name.trim(), cost);
    setSaving(false);
    if (result?.error) {
      toast.error(result.error);
      return;
    }
    setEditing(false);
    onDone();
  }

  async function handleDelete() {
    const result = await deleteLoyaltyReward(reward.id);
    if (result?.error) {
      toast.error(result.error);
      return;
    }
    onDone();
  }

  if (editing) {
    return (
      <li className="flex flex-wrap items-center gap-2 rounded-md border px-3 py-1.5 text-sm">
        <Input className="w-40" value={name} onChange={(e) => setName(e.target.value)} />
        <Input
          type="number"
          min={1}
          className="w-20"
          value={pointsCost}
          onChange={(e) => setPointsCost(e.target.value)}
        />
        <Button size="sm" disabled={saving} onClick={handleSave}>
          {saving ? "Saving..." : "Save"}
        </Button>
        <Button size="sm" variant="outline" onClick={() => setEditing(false)}>
          Cancel
        </Button>
      </li>
    );
  }

  return (
    <li className="flex items-center justify-between rounded-md border px-3 py-1.5 text-sm">
      <span className={reward.active ? undefined : "text-muted-foreground line-through"}>
        {reward.name} — {reward.points_cost} pts
      </span>
      <div className="flex items-center gap-2">
        <Switch checked={reward.active} onCheckedChange={onToggle} />
        <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
          Edit
        </Button>
        <AlertDialog>
          <AlertDialogTrigger render={<Button size="sm" variant="outline" />}>Delete</AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete &quot;{reward.name}&quot;?</AlertDialogTitle>
              <AlertDialogDescription>
                This can&apos;t be undone. If it&apos;s already been used for a redemption, deleting
                will fail — turn it off instead in that case.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </li>
  );
}

const CUSTOM_RULE_VALUE = "__custom__";

function AwardPointsDialog({
  customer,
  earnRules,
  open,
  onOpenChange,
  onDone,
}: {
  customer: LoyaltyCustomerRow;
  earnRules: LoyaltyEarnRule[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
}) {
  const [ruleId, setRuleId] = useState<string>(earnRules[0]?.id ?? CUSTOM_RULE_VALUE);
  const [customPoints, setCustomPoints] = useState("");
  const [customReason, setCustomReason] = useState("");
  const [isPending, setIsPending] = useState(false);

  const isCustom = ruleId === CUSTOM_RULE_VALUE;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();

    let result;
    if (isCustom) {
      const points = Number(customPoints);
      if (!Number.isInteger(points) || points <= 0) {
        toast.error("Points must be a whole number greater than 0.");
        return;
      }
      if (!customReason.trim()) {
        toast.error("Enter a reason for this custom award.");
        return;
      }
      setIsPending(true);
      result = await awardLoyaltyPoints(customer.id, null, points, customReason.trim());
    } else {
      setIsPending(true);
      result = await awardLoyaltyPoints(customer.id, ruleId, null, null);
    }
    setIsPending(false);

    if (result?.error) {
      toast.error(result.error);
      return;
    }
    toast.success(`Points added for ${customer.name}.`);
    onDone();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add LP — {customer.name}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Current balance: <span className="font-medium text-foreground">{customer.loyalty_points_balance}</span>
          </p>

          <div className="space-y-1">
            <Label>Reason</Label>
            <Select value={ruleId} onValueChange={(v) => v && setRuleId(v)}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select" />
              </SelectTrigger>
              <SelectContent>
                {earnRules.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.label} — {r.points} pts
                  </SelectItem>
                ))}
                <SelectItem value={CUSTOM_RULE_VALUE}>Custom amount...</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {isCustom && (
            <>
              <div className="space-y-1">
                <Label>Points *</Label>
                <Input
                  type="number"
                  min={1}
                  value={customPoints}
                  onChange={(e) => setCustomPoints(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1">
                <Label>Reason *</Label>
                <Textarea
                  value={customReason}
                  onChange={(e) => setCustomReason(e.target.value)}
                  rows={2}
                  required
                />
              </div>
            </>
          )}

          <Button type="submit" disabled={isPending} className="w-full">
            {isPending ? "Saving..." : "Add LP"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RedeemDialog({
  customer,
  rewards,
  open,
  onOpenChange,
  onDone,
}: {
  customer: LoyaltyCustomerRow;
  rewards: LoyaltyReward[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
}) {
  const [rewardId, setRewardId] = useState<string>(rewards[0]?.id ?? "");
  const [isPending, setIsPending] = useState(false);

  const selected = rewards.find((r) => r.id === rewardId);
  const canAfford = selected ? customer.loyalty_points_balance >= selected.points_cost : false;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!selected) {
      toast.error("Choose a reward.");
      return;
    }
    if (!canAfford) {
      toast.error("Not enough points for this reward.");
      return;
    }
    setIsPending(true);
    const result = await redeemLoyaltyReward(customer.id, rewardId);
    setIsPending(false);

    if (result?.error) {
      toast.error(result.error);
      return;
    }
    toast.success(`Redeemed ${selected.name} for ${customer.name}.`);
    onDone();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Redeem — {customer.name}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Current balance: <span className="font-medium text-foreground">{customer.loyalty_points_balance}</span>
          </p>

          {rewards.length === 0 ? (
            <p className="text-sm text-muted-foreground">No active rewards in the catalog yet.</p>
          ) : (
            <div className="space-y-1">
              <Label>Reward</Label>
              <Select value={rewardId} onValueChange={(v) => v && setRewardId(v)}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  {rewards.map((r) => (
                    <SelectItem
                      key={r.id}
                      value={r.id}
                      disabled={customer.loyalty_points_balance < r.points_cost}
                    >
                      {r.name} — {r.points_cost} pts
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selected && !canAfford && (
                <p className="text-xs text-destructive">
                  {customer.name} only has {customer.loyalty_points_balance} points — needs {selected.points_cost}.
                </p>
              )}
            </div>
          )}

          <Button type="submit" disabled={isPending || !selected || !canAfford} className="w-full">
            {isPending ? "Redeeming..." : "Redeem"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function VoidRedemptionDialog({
  entry,
  open,
  onOpenChange,
  onDone,
}: {
  entry: LoyaltyPointsLedgerEntry;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
}) {
  const [reason, setReason] = useState("");
  const [isPending, setIsPending] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!reason.trim()) {
      toast.error("Enter a reason for voiding this redemption.");
      return;
    }
    setIsPending(true);
    const result = await voidLoyaltyRedemption(entry.id, reason.trim());
    setIsPending(false);

    if (result?.error) {
      toast.error(result.error);
      return;
    }
    toast.success(`Redemption voided — ${Math.abs(entry.points)} points refunded.`);
    onDone();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Void this redemption?</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <p className="text-sm text-muted-foreground">
            This refunds <span className="font-medium text-foreground">{Math.abs(entry.points)}</span> points
            back to the customer&apos;s balance.
          </p>
          <div className="space-y-1">
            <Label>Reason *</Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. redeemed the wrong customer by mistake"
              rows={2}
              required
            />
          </div>
          <Button type="submit" disabled={isPending} className="w-full">
            {isPending ? "Voiding..." : "Void redemption"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
