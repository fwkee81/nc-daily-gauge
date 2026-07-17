"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentCoach } from "@/lib/auth";
import type { InventoryDirection } from "@/lib/types/database";

export interface InventoryLineInput {
  productId: string;
  quantity: number;
}

export async function recordInventoryBatch(input: {
  direction: InventoryDirection;
  txnDate: string;
  customerId: string | null;
  remark: string | null;
  lines: InventoryLineInput[];
}) {
  const coach = await getCurrentCoach();
  if (!coach || !coach.nc_club_id) {
    return { error: "Not authorized." };
  }
  if (input.lines.length === 0) {
    return { error: "Add at least one product." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("inventory_transactions").insert(
    input.lines.map((line) => ({
      nc_club_id: coach.nc_club_id,
      product_id: line.productId,
      direction: input.direction,
      quantity: line.quantity,
      txn_date: input.txnDate,
      customer_id: input.customerId,
      recorded_by: coach.id,
      remark: input.remark,
    }))
  );

  if (error) return { error: error.message };

  revalidatePath("/inventory");
  return { success: true };
}

export async function voidInventoryTransaction(transactionId: string, reason: string) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("void_inventory_transaction", {
    p_transaction_id: transactionId,
    p_reason: reason,
  });

  if (error) return { error: error.message };

  revalidatePath("/inventory");
  return { success: true };
}

export async function addProduct(name: string, vp: number) {
  const coach = await getCurrentCoach();
  if (!coach || !coach.is_admin) {
    return { error: "Only the club Owner or Internship coach can add products." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("products")
    .insert({ name, vp })
    .select("id, name, vp")
    .single();

  if (error) return { error: error.message };

  revalidatePath("/inventory");
  return { success: true, product: data };
}
