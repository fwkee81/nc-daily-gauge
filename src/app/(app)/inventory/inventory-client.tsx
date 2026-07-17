"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, ArrowDownToLine, ArrowUpFromLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { InventoryStockLevelRow, InventoryTransaction } from "@/lib/types/database";
import { StockDialog } from "./stock-dialog";
import { AddProductDialog } from "./add-product-dialog";
import { TransactionsTable } from "./transactions-table";

interface ProductOption {
  id: string;
  name: string;
  vp: number;
}

interface PersonOption {
  id: string;
  name: string;
}

export function InventoryClient({
  isAdmin,
  clubName,
  products,
  stockLevels,
  customers,
  coaches,
  transactions,
}: {
  isAdmin: boolean;
  clubName: string | null;
  products: ProductOption[];
  stockLevels: InventoryStockLevelRow[];
  customers: PersonOption[];
  coaches: PersonOption[];
  transactions: InventoryTransaction[];
}) {
  const router = useRouter();
  const [stockDialog, setStockDialog] = useState<"in" | "out" | null>(null);
  const [addProductOpen, setAddProductOpen] = useState(false);

  const customerNameById = useMemo(() => new Map(customers.map((c) => [c.id, c.name])), [customers]);
  const coachNameById = useMemo(() => new Map(coaches.map((c) => [c.id, c.name])), [coaches]);
  const productNameById = useMemo(() => new Map(products.map((p) => [p.id, p.name])), [products]);

  const totalOnHandVp = useMemo(
    () => stockLevels.reduce((sum, s) => sum + s.on_hand * s.vp, 0),
    [stockLevels]
  );

  function handleDone() {
    router.refresh();
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Inventory</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {clubName ?? "Your club"} — stock in/out for Herbalife products.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isAdmin && (
            <Button variant="outline" className="gap-1.5" onClick={() => setAddProductOpen(true)}>
              <Plus className="size-4" /> Add product
            </Button>
          )}
          <Button variant="secondary" className="gap-1.5" onClick={() => setStockDialog("in")}>
            <ArrowDownToLine className="size-4" /> Stock in
          </Button>
          <Button className="gap-1.5" onClick={() => setStockDialog("out")}>
            <ArrowUpFromLine className="size-4" /> Stock out
          </Button>
        </div>
      </div>

      <div className="mt-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Current stock</h2>
          <p className="text-sm text-muted-foreground">
            Total on-hand value: <span className="font-medium text-foreground">{totalOnHandVp.toFixed(2)} VP</span>
          </p>
        </div>
        <div className="mt-3 overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead>VP</TableHead>
                <TableHead>On hand</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {stockLevels.map((s) => (
                <TableRow key={s.product_id}>
                  <TableCell className="font-medium">{s.product_name}</TableCell>
                  <TableCell>{s.vp}</TableCell>
                  <TableCell className={s.on_hand < 0 ? "font-medium text-destructive" : ""}>
                    {s.on_hand}
                  </TableCell>
                </TableRow>
              ))}
              {stockLevels.length === 0 && (
                <TableRow>
                  <TableCell colSpan={3} className="text-center text-muted-foreground">
                    No products yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <div className="mt-8">
        <h2 className="text-lg font-semibold">Recent movements</h2>
        <div className="mt-3">
          <TransactionsTable
            transactions={transactions}
            productNameById={productNameById}
            customerNameById={customerNameById}
            coachNameById={coachNameById}
          />
        </div>
      </div>

      {stockDialog && (
        <StockDialog
          direction={stockDialog}
          open={Boolean(stockDialog)}
          onOpenChange={(open) => !open && setStockDialog(null)}
          products={products}
          customers={customers}
          onDone={handleDone}
        />
      )}

      {isAdmin && (
        <AddProductDialog
          open={addProductOpen}
          onOpenChange={setAddProductOpen}
          onDone={handleDone}
        />
      )}
    </div>
  );
}
