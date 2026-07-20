import { redirect } from "next/navigation";
import { getCurrentCoach } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { InventoryClient } from "./inventory-client";

export default async function InventoryPage() {
  const coach = await getCurrentCoach();
  if (!coach) redirect("/onboarding");

  if (!coach.nc_club_id) {
    return (
      <div className="rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
        Join a club before using Inventory.
      </div>
    );
  }

  const supabase = await createClient();
  const [
    { data: products },
    { data: stockLevels },
    { data: customers },
    { data: coaches },
    { data: club },
    { data: transactions },
  ] = await Promise.all([
    supabase.from("products").select("id, name, vp").eq("active", true).order("name"),
    supabase.rpc("inventory_stock_levels"),
    supabase
      .from("customers")
      .select("id, name")
      .eq("nc_club_id", coach.nc_club_id)
      .eq("active", true)
      .order("name"),
    supabase
      .from("coaches")
      .select("id, name")
      .eq("nc_club_id", coach.nc_club_id)
      .eq("active", true)
      .order("name"),
    supabase.from("nc_clubs").select("name").eq("id", coach.nc_club_id).maybeSingle(),
    supabase
      .from("inventory_transactions")
      .select(
        "id, nc_club_id, product_id, direction, quantity, txn_date, customer_id, recorded_by, remark, created_at, voided, voided_by, void_reason, voided_at"
      )
      .eq("nc_club_id", coach.nc_club_id)
      .order("created_at", { ascending: false })
      .limit(300),
  ]);

  return (
    <InventoryClient
      isAdmin={coach.is_admin}
      clubName={club?.name ?? null}
      products={products ?? []}
      stockLevels={stockLevels ?? []}
      customers={customers ?? []}
      coaches={coaches ?? []}
      transactions={transactions ?? []}
    />
  );
}
