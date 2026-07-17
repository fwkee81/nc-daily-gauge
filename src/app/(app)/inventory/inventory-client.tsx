"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, ArrowDownToLine, ArrowUpFromLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { InventoryStockLevelRow, InventoryTransaction } from "@/lib/types/database";
import { StockDialog } from "./stock-dialog";
import { AddProductDialog } from "./add-product-dialog";
import { TransactionsTable } from "./transactions-table";

// The products coaches reach for every day — shown as a prominent grid up
// top so they don't have to scan the full catalog. Everything else still
// shows up below, under "Other products". Matched by exact product name
// (see the seed list in supabase/migrations/051_inventory.sql).
const FREQUENT_GROUPS: { label: string; names: string[] }[] = [
  {
    label: "F1 Shakes",
    names: [
      "F1 Vanilla",
      "F1 Chocolate",
      "F1 Summer Berries",
      "F1 Banana",
      "F1 Cookies",
      "F1 Latte",
      "F1 Red Bean",
    ],
  },
  {
    label: "Aloe",
    names: ["Aloe Original", "Aloe Mandarin", "Aloe Mango"],
  },
  {
    label: "Tea",
    names: ["Tea Lemon 100g", "Tea Peach 100g", "Tea Ginger 100g", "Guarana Tea"],
  },
];

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

  const stockByName = useMemo(
    () => new Map(stockLevels.map((s) => [s.product_name, s])),
    [stockLevels]
  );
  const frequentNames = useMemo(
    () => new Set(FREQUENT_GROUPS.flatMap((g) => g.names)),
    []
  );
  const otherStock = useMemo(
    () =>
      stockLevels
        .filter((s) => !frequentNames.has(s.product_name))
        .sort((a, b) => a.product_name.localeCompare(b.product_name)),
    [stockLevels, frequentNames]
  );

  function handleDone() {
    router.refresh();
  }

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Inventory</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {clubName ?? "Your club"} — stock in/out for Herbalife products.
          </p>
        </div>
        {isAdmin && (
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 text-muted-foreground"
            onClick={() => setAddProductOpen(true)}
          >
            <Plus className="size-4" /> Add product
          </Button>
        )}
      </div>

      <div className="mt-4 flex gap-3">
        <Button
          variant="secondary"
          className="h-14 flex-1 gap-2 rounded-xl text-base font-semibold"
          onClick={() => setStockDialog("in")}
        >
          <ArrowDownToLine className="size-5" /> Stock in
        </Button>
        <Button
          className="h-14 flex-1 gap-2 rounded-xl text-base font-semibold"
          onClick={() => setStockDialog("out")}
        >
          <ArrowUpFromLine className="size-5" /> Stock out
        </Button>
      </div>

      <div className="mt-8">
        <h2 className="text-lg font-semibold">Current stock</h2>

        {FREQUENT_GROUPS.map((group) => {
          const items = group.names
            .map((name) => stockByName.get(name))
            .filter((s): s is InventoryStockLevelRow => Boolean(s));
          if (items.length === 0) return null;

          return (
            <div key={group.label} className="mt-4">
              <h3 className="text-sm font-medium text-muted-foreground">{group.label}</h3>
              <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
                {items.map((s) => (
                  <div key={s.product_id} className="rounded-md border px-3 py-2.5">
                    <p className="text-sm leading-tight font-medium">{s.product_name}</p>
                    <p
                      className={cn(
                        "mt-1 text-xl font-semibold",
                        s.on_hand < 0 && "text-destructive"
                      )}
                    >
                      {s.on_hand}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          );
        })}

        {otherStock.length > 0 && (
          <div className="mt-6">
            <h3 className="text-sm font-medium text-muted-foreground">Other products</h3>
            <div className="mt-2 divide-y rounded-md border">
              {otherStock.map((s) => (
                <div
                  key={s.product_id}
                  className="flex items-center justify-between px-3 py-2 text-sm"
                >
                  <span>{s.product_name}</span>
                  <span className={cn("font-medium", s.on_hand < 0 && "text-destructive")}>
                    {s.on_hand}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {stockLevels.length === 0 && (
          <p className="mt-3 text-sm text-muted-foreground">No products yet.</p>
        )}
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
