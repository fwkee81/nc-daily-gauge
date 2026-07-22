"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { addDays, format, parse, parseISO } from "date-fns";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Combobox, type ComboboxOption } from "@/components/combobox";
import { cn } from "@/lib/utils";
import {
  FINANCE_EXPENSE_CATEGORIES,
  FINANCE_INCOME_CATEGORIES,
  FINANCE_INCOME_DEFAULT_AMOUNT,
  FINANCE_PAYMENT_METHODS,
} from "@/lib/constants";
import type { FinanceCategory, FinanceDirection, FinancePaymentMethod } from "@/lib/types/database";
import { addFinanceTransaction, voidFinanceTransaction } from "./actions";

export interface FinanceTxnRow {
  id: string;
  direction: FinanceDirection;
  category: string;
  detail: string | null;
  amount: number;
  paymentMethod: string;
  customerName: string | null;
  remark: string | null;
  responsibleCoachName: string | null;
  recordedByCoachName: string | null;
  createdAt: string;
  voided: boolean;
  voidReason: string | null;
  voidedByCoachName: string | null;
}

export interface FinanceCategoryBreakdown {
  category: string;
  count: number;
  total: number;
}

// Owner-only monthly rollup — null when the current coach isn't an Owner
// (nothing was even fetched server-side in that case).
export interface FinanceMonthlySummary {
  totalIncome: number;
  totalExpense: number;
  net: number;
  incomeByPayment: Record<string, number>;
  incomeCategories: FinanceCategoryBreakdown[];
  expenseCategories: FinanceCategoryBreakdown[];
}

interface CoachOption {
  id: string;
  name: string;
}

function VoidDialog({
  transaction,
  open,
  onOpenChange,
}: {
  transaction: FinanceTxnRow;
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
    const result = await voidFinanceTransaction(transaction.id, reason.trim());
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
            {transaction.direction === "in" ? "+" : "-"}RM {transaction.amount.toFixed(2)} ·{" "}
            {transaction.category}. It will no longer count toward the Finance Summary, but stays
            visible in the ledger.
          </p>

          <div className="space-y-1">
            <Label>Reason *</Label>
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. entered wrong amount"
            />
          </div>

          <Button className="w-full" variant="destructive" onClick={handleVoid} disabled={submitting}>
            {submitting ? "Voiding..." : "Void record"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CategoryBreakdownTable({ rows }: { rows: FinanceCategoryBreakdown[] }) {
  return (
    <div className="overflow-x-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Category</TableHead>
            <TableHead className="text-right">Count</TableHead>
            <TableHead className="text-right">Total</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.category}>
              <TableCell>{r.category}</TableCell>
              <TableCell className="text-right">{r.count}</TableCell>
              <TableCell className="text-right">RM {r.total.toFixed(2)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export function FinanceClient({
  date,
  hasExplicitDate,
  view,
  month,
  hasExplicitMonth,
  transactions,
  monthlySummary,
  coaches,
  isOwner,
  isAdmin,
}: {
  date: string;
  hasExplicitDate: boolean;
  view: "daily" | "monthly";
  month: string;
  hasExplicitMonth: boolean;
  transactions: FinanceTxnRow[];
  monthlySummary: FinanceMonthlySummary | null;
  coaches: CoachOption[];
  isOwner: boolean;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [direction, setDirection] = useState<FinanceDirection>("in");
  const [category, setCategory] = useState<FinanceCategory>("5-Day Card");
  const [detail, setDetail] = useState("");
  const [amount, setAmount] = useState("98");
  const [paymentMethod, setPaymentMethod] = useState<FinancePaymentMethod>("Cash");
  const [customerName, setCustomerName] = useState("");
  const [responsibleCoachId, setResponsibleCoachId] = useState<string | null>(null);
  const [remark, setRemark] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [voidTarget, setVoidTarget] = useState<FinanceTxnRow | null>(null);

  // The server defaults "today"/"this month" using its own clock (Vercel
  // runs in UTC), which can be off from the club's actual local date for
  // several hours a day. If neither was explicitly requested, self-correct
  // to the browser's local values right after hydration. Mirrors Daily
  // Report / NC Metrics.
  useEffect(() => {
    if (hasExplicitDate) return;
    const clientToday = format(new Date(), "yyyy-MM-dd");
    if (clientToday !== date) {
      router.replace(`/finance?view=${view}&date=${clientToday}&month=${month}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (hasExplicitMonth) return;
    const clientMonth = format(new Date(), "yyyy-MM");
    if (clientMonth !== month) {
      router.replace(`/finance?view=${view}&date=${date}&month=${clientMonth}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const categories = direction === "in" ? FINANCE_INCOME_CATEGORIES : FINANCE_EXPENSE_CATEGORIES;
  const coachOptions: ComboboxOption[] = coaches.map((c) => ({ value: c.id, label: c.name }));

  function handleDirectionChange(next: FinanceDirection) {
    setDirection(next);
    const firstCategory = (next === "in" ? FINANCE_INCOME_CATEGORIES : FINANCE_EXPENSE_CATEGORIES)[0];
    setCategory(firstCategory);
    setDetail("");
    const defaultAmount = FINANCE_INCOME_DEFAULT_AMOUNT[firstCategory];
    setAmount(defaultAmount != null ? String(defaultAmount) : "");
  }

  function handleCategoryChange(next: FinanceCategory) {
    setCategory(next);
    setDetail("");
    const defaultAmount = FINANCE_INCOME_DEFAULT_AMOUNT[next];
    setAmount(defaultAmount != null ? String(defaultAmount) : "");
  }

  function goToDate(d: string) {
    router.push(`/finance?view=daily&date=${d}&month=${month}`);
  }

  function goToMonth(m: string) {
    router.push(`/finance?view=monthly&date=${date}&month=${m}`);
  }

  function goToView(next: "daily" | "monthly") {
    router.push(`/finance?view=${next}&date=${date}&month=${month}`);
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
    if (!responsibleCoachId) {
      setError("Please choose the responsible coach.");
      return;
    }
    if (category === "Others" && !detail.trim()) {
      setError("Please specify what this 'Others' entry is.");
      return;
    }

    setIsPending(true);
    const result = await addFinanceTransaction({
      date,
      direction,
      category,
      detail: category === "Others" ? detail.trim() : null,
      amount: amt,
      paymentMethod,
      customerName: direction === "in" ? customerName.trim() : null,
      responsibleCoachId,
      remark: remark.trim() || null,
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
    setDetail("");
    setRemark("");
    router.refresh();
  }

  const totals = useMemo(() => {
    const active = transactions.filter((t) => !t.voided);
    const totalIn = active.filter((t) => t.direction === "in").reduce((s, t) => s + t.amount, 0);
    const totalOut = active.filter((t) => t.direction === "out").reduce((s, t) => s + t.amount, 0);
    return { totalIn, totalOut, net: totalIn - totalOut };
  }, [transactions]);

  const parsedDate = parseISO(date);
  const parsedMonth = parse(month, "yyyy-MM", new Date());

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Finance</h1>
        <Tabs value={view} onValueChange={(v) => goToView(v as "daily" | "monthly")}>
          <TabsList>
            <TabsTrigger value="daily">Daily</TabsTrigger>
            {isOwner && <TabsTrigger value="monthly">Monthly</TabsTrigger>}
          </TabsList>
        </Tabs>
      </div>

      {view === "daily" ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-lg font-medium">{format(parsedDate, "EEEE, d MMM yyyy")}</p>
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
                  <Select
                    value={category}
                    onValueChange={(v) => handleCategoryChange(v as FinanceCategory)}
                  >
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

              {category === "Others" && (
                <div className="space-y-1">
                  <Label>What is it? *</Label>
                  <Input
                    value={detail}
                    onChange={(e) => setDetail(e.target.value)}
                    placeholder="Specify what this 'Others' entry is"
                  />
                </div>
              )}

              {direction === "in" && (
                <div className="space-y-1">
                  <Label>Customer Name</Label>
                  <Input
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="Customer name"
                  />
                </div>
              )}

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

              <div className="space-y-1">
                <Label>Remark</Label>
                <Textarea
                  value={remark}
                  onChange={(e) => setRemark(e.target.value)}
                  placeholder="Any extra notes about this entry..."
                  rows={2}
                />
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
              <CardContent>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-md border px-3 py-2">
                    <p className="text-xs text-muted-foreground">Total In</p>
                    <p className="text-lg font-semibold text-primary">RM {totals.totalIn.toFixed(2)}</p>
                  </div>
                  <div className="rounded-md border px-3 py-2">
                    <p className="text-xs text-muted-foreground">Total Out</p>
                    <p className="text-lg font-semibold text-destructive">
                      RM {totals.totalOut.toFixed(2)}
                    </p>
                  </div>
                </div>
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
                    <TableHead>Remark</TableHead>
                    {isAdmin && <TableHead />}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transactions.map((t) => (
                    <TableRow key={t.id} className={t.voided ? "opacity-50" : undefined}>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          {t.direction === "in" ? (
                            <Badge>In</Badge>
                          ) : (
                            <Badge variant="secondary">Out</Badge>
                          )}
                          {t.voided && <Badge variant="destructive">Voided</Badge>}
                        </div>
                      </TableCell>
                      <TableCell>
                        {t.category === "Others" && t.detail ? `Others — ${t.detail}` : t.category}
                      </TableCell>
                      <TableCell className={t.direction === "in" ? "text-primary" : "text-destructive"}>
                        {t.direction === "in" ? "+" : "-"}RM {t.amount.toFixed(2)}
                      </TableCell>
                      <TableCell>{t.paymentMethod}</TableCell>
                      <TableCell>
                        {t.direction === "in" ? (
                          <>
                            <div>{t.customerName}</div>
                            {t.responsibleCoachName && (
                              <div className="text-xs text-muted-foreground">
                                Coach: {t.responsibleCoachName}
                              </div>
                            )}
                          </>
                        ) : (
                          t.responsibleCoachName
                        )}
                      </TableCell>
                      <TableCell>
                        {t.voided
                          ? `Voided by ${t.voidedByCoachName ?? "—"} — ${t.voidReason}`
                          : t.recordedByCoachName ?? "—"}
                      </TableCell>
                      <TableCell>{format(new Date(t.createdAt), "p")}</TableCell>
                      <TableCell className="max-w-56 whitespace-pre-wrap text-muted-foreground">
                        {t.remark ?? "—"}
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
                  {transactions.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={isAdmin ? 9 : 8} className="text-center text-muted-foreground">
                        No transactions recorded for this day.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </>
      ) : (
        isOwner &&
        monthlySummary && (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-lg font-medium">{format(parsedMonth, "MMMM yyyy")}</p>
              <Input
                type="month"
                className="w-auto"
                value={month}
                onChange={(e) => goToMonth(e.target.value)}
              />
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Overview</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-3 gap-3">
                  <div className="rounded-md border px-3 py-2">
                    <p className="text-xs text-muted-foreground">Total Income</p>
                    <p className="text-lg font-semibold text-primary">
                      RM {monthlySummary.totalIncome.toFixed(2)}
                    </p>
                  </div>
                  <div className="rounded-md border px-3 py-2">
                    <p className="text-xs text-muted-foreground">Total Expense</p>
                    <p className="text-lg font-semibold text-destructive">
                      RM {monthlySummary.totalExpense.toFixed(2)}
                    </p>
                  </div>
                  <div className="rounded-md border px-3 py-2">
                    <p className="text-xs text-muted-foreground">Profit / Loss</p>
                    <p
                      className={cn(
                        "text-lg font-semibold",
                        monthlySummary.net >= 0 ? "text-primary" : "text-destructive"
                      )}
                    >
                      RM {monthlySummary.net.toFixed(2)}
                    </p>
                  </div>
                </div>

                <div>
                  <p className="mb-2 text-xs font-medium text-muted-foreground">
                    Income by payment method
                  </p>
                  <div className="grid grid-cols-3 gap-3">
                    {FINANCE_PAYMENT_METHODS.map((m) => (
                      <div key={m} className="rounded-md border px-3 py-2">
                        <p className="text-xs text-muted-foreground">{m}</p>
                        <p className="text-sm font-semibold">
                          RM {(monthlySummary.incomeByPayment[m] ?? 0).toFixed(2)}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>

            <div>
              <h2 className="text-lg font-semibold">Income by Category</h2>
              <div className="mt-2">
                <CategoryBreakdownTable rows={monthlySummary.incomeCategories} />
              </div>
            </div>

            <div>
              <h2 className="text-lg font-semibold">Expenses by Category</h2>
              <div className="mt-2">
                <CategoryBreakdownTable rows={monthlySummary.expenseCategories} />
              </div>
            </div>
          </>
        )
      )}

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
