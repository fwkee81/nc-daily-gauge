"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { addDays, format, parseISO } from "date-fns";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Combobox, type ComboboxOption } from "@/components/combobox";
import { cn } from "@/lib/utils";
import {
  FINANCE_EXPENSE_CATEGORIES,
  FINANCE_INCOME_CATEGORIES,
  FINANCE_INCOME_DEFAULT_AMOUNT,
  FINANCE_PAYMENT_METHODS,
} from "@/lib/constants";
import type { FinanceCategory, FinanceDirection, FinancePaymentMethod } from "@/lib/types/database";
import { addFinanceTransaction } from "./actions";

export interface FinanceTxnRow {
  id: string;
  direction: FinanceDirection;
  category: string;
  amount: number;
  paymentMethod: string;
  customerName: string | null;
  responsibleCoachName: string | null;
  recordedByCoachName: string | null;
  createdAt: string;
}

interface CoachOption {
  id: string;
  name: string;
}

export function FinanceClient({
  date,
  hasExplicitDate,
  transactions,
  coaches,
  isOwner,
}: {
  date: string;
  hasExplicitDate: boolean;
  transactions: FinanceTxnRow[];
  coaches: CoachOption[];
  isOwner: boolean;
}) {
  const router = useRouter();
  const [direction, setDirection] = useState<FinanceDirection>("in");
  const [category, setCategory] = useState<FinanceCategory>("5-Day Card");
  const [amount, setAmount] = useState("98");
  const [paymentMethod, setPaymentMethod] = useState<FinancePaymentMethod>("Cash");
  const [customerName, setCustomerName] = useState("");
  const [responsibleCoachId, setResponsibleCoachId] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The server defaults "today" using its own clock (Vercel runs in UTC),
  // which can be a day off from the club's actual local date for several
  // hours a day. If no date was explicitly requested, self-correct to the
  // browser's local today right after hydration. Mirrors Daily Report.
  useEffect(() => {
    if (hasExplicitDate) return;
    const clientToday = format(new Date(), "yyyy-MM-dd");
    if (clientToday !== date) {
      router.replace(`/finance?date=${clientToday}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const categories = direction === "in" ? FINANCE_INCOME_CATEGORIES : FINANCE_EXPENSE_CATEGORIES;
  const coachOptions: ComboboxOption[] = coaches.map((c) => ({ value: c.id, label: c.name }));

  function handleDirectionChange(next: FinanceDirection) {
    setDirection(next);
    const firstCategory = (next === "in" ? FINANCE_INCOME_CATEGORIES : FINANCE_EXPENSE_CATEGORIES)[0];
    setCategory(firstCategory);
    const defaultAmount = FINANCE_INCOME_DEFAULT_AMOUNT[firstCategory];
    setAmount(defaultAmount != null ? String(defaultAmount) : "");
  }

  function handleCategoryChange(next: FinanceCategory) {
    setCategory(next);
    const defaultAmount = FINANCE_INCOME_DEFAULT_AMOUNT[next];
    setAmount(defaultAmount != null ? String(defaultAmount) : "");
  }

  function goToDate(d: string) {
    router.push(`/finance?date=${d}`);
  }

  async function handleSubmit() {
    setError(null);
    const amt = Number(amount);
    if (!amt || amt <= 0) {
      setError("Amount must be a positive number.");
      return;
    }
    if (direction === "in" && !customerName.trim()) {
      setError("Please enter the customer's name.");
      return;
    }
    if (direction === "out" && !responsibleCoachId) {
      setError("Please choose the responsible coach.");
      return;
    }

    setIsPending(true);
    const result = await addFinanceTransaction({
      date,
      direction,
      category,
      amount: amt,
      paymentMethod,
      customerName: direction === "in" ? customerName.trim() : null,
      responsibleCoachId: direction === "out" ? responsibleCoachId : null,
    });
    setIsPending(false);

    if (result.error) {
      setError(result.error);
      toast.error(result.error);
      return;
    }

    toast.success(direction === "in" ? "Income recorded." : "Expense recorded.");
    setCustomerName("");
    setResponsibleCoachId(null);
    router.refresh();
  }

  const totals = useMemo(() => {
    const totalIn = transactions.filter((t) => t.direction === "in").reduce((s, t) => s + t.amount, 0);
    const totalOut = transactions.filter((t) => t.direction === "out").reduce((s, t) => s + t.amount, 0);
    return { totalIn, totalOut, net: totalIn - totalOut };
  }, [transactions]);

  const categoryBreakdown = useMemo(() => {
    const map = new Map<string, { direction: FinanceDirection; category: string; total: number }>();
    for (const t of transactions) {
      const key = `${t.direction}-${t.category}`;
      const existing = map.get(key);
      if (existing) existing.total += t.amount;
      else map.set(key, { direction: t.direction, category: t.category, total: t.amount });
    }
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [transactions]);

  const parsedDate = parseISO(date);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Finance · {format(parsedDate, "EEEE, d MMM yyyy")}</h1>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => goToDate(format(addDays(parsedDate, -1), "yyyy-MM-dd"))}
          >
            ← Prev day
          </Button>
          <Input
            type="date"
            className="w-auto"
            value={date}
            onChange={(e) => goToDate(e.target.value)}
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => goToDate(format(addDays(parsedDate, 1), "yyyy-MM-dd"))}
          >
            Next day →
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Add Entry</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <p className="rounded-md bg-destructive/10 p-2 text-sm text-destructive">{error}</p>
          )}

          <div className="flex gap-2">
            <Button
              type="button"
              variant={direction === "in" ? "default" : "outline"}
              className="flex-1"
              onClick={() => handleDirectionChange("in")}
            >
              Income
            </Button>
            <Button
              type="button"
              variant={direction === "out" ? "default" : "outline"}
              className="flex-1"
              onClick={() => handleDirectionChange("out")}
            >
              Expense
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Category</Label>
              <Select value={category} onValueChange={(v) => handleCategoryChange(v as FinanceCategory)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Amount (RM)</Label>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
          </div>

          {direction === "in" ? (
            <div className="space-y-1">
              <Label>Customer Name</Label>
              <Input
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Customer name"
              />
            </div>
          ) : (
            <div className="space-y-1">
              <Label>Responsible Coach</Label>
              <Combobox
                options={coachOptions}
                value={responsibleCoachId}
                onChange={setResponsibleCoachId}
                placeholder="Choose coach"
                searchPlaceholder="Search coaches..."
                emptyText="No coaches found."
              />
            </div>
          )}

          <div className="space-y-1">
            <Label>Payment Method</Label>
            <div className="flex gap-2">
              {FINANCE_PAYMENT_METHODS.map((m) => (
                <button
                  key={m}
                  type="button"
                  className={cn(
                    "flex-1 rounded-md border px-3 py-2 text-sm transition-colors",
                    paymentMethod === m ? "border-primary bg-primary/10 font-medium" : "hover:bg-accent"
                  )}
                  onClick={() => setPaymentMethod(m)}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          <Button onClick={handleSubmit} disabled={isPending} className="w-full">
            {isPending ? "Saving..." : direction === "in" ? "Record Income" : "Record Expense"}
          </Button>
        </CardContent>
      </Card>

      {isOwner && (
        <Card>
          <CardHeader>
            <CardTitle>Finance Summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-md border px-3 py-2">
                <p className="text-xs text-muted-foreground">Total In</p>
                <p className="text-lg font-semibold text-primary">RM {totals.totalIn.toFixed(2)}</p>
              </div>
              <div className="rounded-md border px-3 py-2">
                <p className="text-xs text-muted-foreground">Total Out</p>
                <p className="text-lg font-semibold text-destructive">RM {totals.totalOut.toFixed(2)}</p>
              </div>
              <div className="rounded-md border px-3 py-2">
                <p className="text-xs text-muted-foreground">Net</p>
                <p className="text-lg font-semibold">RM {totals.net.toFixed(2)}</p>
              </div>
            </div>

            {categoryBreakdown.length > 0 && (
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Category</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {categoryBreakdown.map((c) => (
                      <TableRow key={`${c.direction}-${c.category}`}>
                        <TableCell>{c.category}</TableCell>
                        <TableCell>
                          {c.direction === "in" ? (
                            <Badge>In</Badge>
                          ) : (
                            <Badge variant="secondary">Out</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">RM {c.total.toFixed(2)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <div>
        <h2 className="text-lg font-semibold">Today&apos;s Transactions</h2>
        <div className="mt-2 overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Type</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Payment</TableHead>
                <TableHead>Customer / Coach</TableHead>
                <TableHead>Recorded By</TableHead>
                <TableHead>Time</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {transactions.map((t) => (
                <TableRow key={t.id}>
                  <TableCell>
                    {t.direction === "in" ? <Badge>In</Badge> : <Badge variant="secondary">Out</Badge>}
                  </TableCell>
                  <TableCell>{t.category}</TableCell>
                  <TableCell className={t.direction === "in" ? "text-primary" : "text-destructive"}>
                    {t.direction === "in" ? "+" : "-"}RM {t.amount.toFixed(2)}
                  </TableCell>
                  <TableCell>{t.paymentMethod}</TableCell>
                  <TableCell>{t.direction === "in" ? t.customerName : t.responsibleCoachName}</TableCell>
                  <TableCell>{t.recordedByCoachName ?? "—"}</TableCell>
                  <TableCell>{format(new Date(t.createdAt), "p")}</TableCell>
                </TableRow>
              ))}
              {transactions.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground">
                    No transactions recorded for this day.
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
