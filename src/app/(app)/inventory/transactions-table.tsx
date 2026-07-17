"use client";

import { useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { InventoryDirection, InventoryTransaction } from "@/lib/types/database";

export function TransactionsTable({
  transactions,
  productNameById,
  customerNameById,
  coachNameById,
}: {
  transactions: InventoryTransaction[];
  productNameById: Map<string, string>;
  customerNameById: Map<string, string>;
  coachNameById: Map<string, string>;
}) {
  const [search, setSearch] = useState("");
  const [directionFilter, setDirectionFilter] = useState<InventoryDirection | "all">("all");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return transactions.filter((t) => {
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
  }, [transactions, search, directionFilter, productNameById, customerNameById, coachNameById]);

  return (
    <div>
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
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((t) => (
              <TableRow key={t.id}>
                <TableCell>{format(parseISO(t.txn_date), "d MMM yyyy")}</TableCell>
                <TableCell className="font-medium">
                  {productNameById.get(t.product_id) ?? "—"}
                </TableCell>
                <TableCell>{t.quantity}</TableCell>
                <TableCell>
                  <Badge variant={t.direction === "in" ? "secondary" : "outline"}>
                    {t.direction === "in" ? "In" : "Out"}
                  </Badge>
                </TableCell>
                <TableCell>
                  {t.customer_id ? customerNameById.get(t.customer_id) ?? "—" : "—"}
                </TableCell>
                <TableCell>
                  {t.recorded_by ? coachNameById.get(t.recorded_by) ?? "—" : "—"}
                </TableCell>
                <TableCell className="max-w-[200px] truncate text-muted-foreground">
                  {t.remark ?? "—"}
                </TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground">
                  No stock movements found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
