"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { format, parseISO } from "date-fns";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { InventoryDirection, InventoryTransaction } from "@/lib/types/database";
import { voidInventoryTransaction } from "./actions";

function VoidDialog({
  transaction,
  open,
  onOpenChange,
}: {
  transaction: InventoryTransaction;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleVoid() {
    if (!reason.trim()) {
      toast.error("Please enter a reason for voiding this record.");
      return;
    }
    setSubmitting(true);
    const result = await voidInventoryTransaction(transaction.id, reason.trim());
    setSubmitting(false);

    if (result.error) {
      toast.error(result.error);
      return;
    }

    toast.success("Record voided.");
    setReason("");
    onOpenChange(false);
    router.refresh();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setReason("");
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Void this record?</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {transaction.quantity} × stock {transaction.direction} on{" "}
            {format(parseISO(transaction.txn_date), "d MMM yyyy")}. It will no longer count
            toward on-hand stock, but stays visible in the log.
          </p>

          <div className="space-y-1">
            <Label>Reason *</Label>
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. entered wrong quantity"
            />
          </div>

          <Button
            className="w-full"
            variant="destructive"
            onClick={handleVoid}
            disabled={submitting}
          >
            {submitting ? "Voiding..." : "Void record"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function TransactionsTable({
  transactions,
  isAdmin,
  productNameById,
  customerNameById,
  coachNameById,
}: {
  transactions: InventoryTransaction[];
  isAdmin: boolean;
  productNameById: Map<string, string>;
  customerNameById: Map<string, string>;
  coachNameById: Map<string, string>;
}) {
  const [search, setSearch] = useState("");
  const [directionFilter, setDirectionFilter] = useState<InventoryDirection | "all">("all");
  const [hideVoided, setHideVoided] = useState(false);
  const [voidTarget, setVoidTarget] = useState<InventoryTransaction | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return transactions.filter((t) => {
      if (hideVoided && t.voided) return false;
      if (directionFilter !== "all" && t.direction !== directionFilter) return false;
      if (!q) return true;
      const productName = productNameById.get(t.product_id) ?? "";
      const customerName = t.customer_id ? customerNameById.get(t.customer_id) ?? "" : "";
      const coachName = t.recorded_by ? coachNameById.get(t.recorded_by) ?? "" : "";
      return (
        productName.toLowerCase().includes(q) ||
        customerName.toLowerCase().includes(q) ||
        coachName.toLowerCase().includes(q) ||
        (t.remark ?? "").toLowerCase().includes(q)
      );
    });
  }, [transactions, search, directionFilter, hideVoided, productNameById, customerNameById, coachNameById]);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <Input
            className="max-w-sm"
            placeholder="Search by product, customer, coach, or remark..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="flex gap-1">
            {(["all", "in", "out"] as const).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDirectionFilter(d)}
                className={
                  "rounded-full px-3 py-1 text-sm capitalize transition-colors " +
                  (directionFilter === d
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent")
                }
              >
                {d}
              </button>
            ))}
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={hideVoided}
            onChange={(e) => setHideVoided(e.target.checked)}
          />
          Hide voided
        </label>
      </div>

      <div className="mt-4 overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Product</TableHead>
              <TableHead>Qty</TableHead>
              <TableHead>In/Out</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>By coach</TableHead>
              <TableHead>Remark</TableHead>
              {isAdmin && <TableHead />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((t) => (
              <TableRow key={t.id} className={t.voided ? "opacity-50" : undefined}>
                <TableCell>{format(parseISO(t.txn_date), "d MMM yyyy")}</TableCell>
                <TableCell className="font-medium">
                  {productNameById.get(t.product_id) ?? "—"}
                </TableCell>
                <TableCell>{t.quantity}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-1.5">
                    <Badge variant={t.direction === "in" ? "secondary" : "outline"}>
                      {t.direction === "in" ? "In" : "Out"}
                    </Badge>
                    {t.voided && <Badge variant="destructive">Voided</Badge>}
                  </div>
                </TableCell>
                <TableCell>
                  {t.customer_id ? customerNameById.get(t.customer_id) ?? "—" : "—"}
                </TableCell>
                <TableCell>
                  {t.recorded_by ? coachNameById.get(t.recorded_by) ?? "—" : "—"}
                </TableCell>
                <TableCell className={cn("max-w-[200px] truncate text-muted-foreground")}>
                  {t.voided
                    ? `Voided by ${t.voided_by ? coachNameById.get(t.voided_by) ?? "—" : "—"} — ${t.void_reason}`
                    : (t.remark ?? "—")}
                </TableCell>
                {isAdmin && (
                  <TableCell>
                    {!t.voided && (
                      <Button variant="ghost" size="sm" onClick={() => setVoidTarget(t)}>
                        Void
                      </Button>
                    )}
                  </TableCell>
                )}
              </TableRow>
            ))}
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={isAdmin ? 8 : 7} className="text-center text-muted-foreground">
                  No stock movements found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {voidTarget && (
        <VoidDialog
          transaction={voidTarget}
          open={Boolean(voidTarget)}
          onOpenChange={(open) => !open && setVoidTarget(null)}
        />
      )}
    </div>
  );
}
