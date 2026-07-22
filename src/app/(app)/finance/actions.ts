"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentCoach } from "@/lib/auth";
import type { FinanceCategory, FinanceDirection, FinancePaymentMethod } from "@/lib/types/database";

export interface FinanceTransactionInput {
  date: string;
  direction: FinanceDirection;
  category: FinanceCategory;
  amount: number;
  paymentMethod: FinancePaymentMethod;
  customerName: string | null;
  responsibleCoachId: string | null;
}

export async function addFinanceTransaction(input: FinanceTransactionInput) {
  const coach = await getCurrentCoach();
  if (!coach || !coach.nc_club_id) {
    return { error: "Not authorized." };
  }

  if (!input.amount || input.amount <= 0) {
    return { error: "Amount must be a positive number." };
  }
  if (input.direction === "in" && !input.customerName?.trim()) {
    return { error: "Please enter the customer's name." };
  }
  if (input.direction === "out" && !input.responsibleCoachId) {
    return { error: "Please choose the responsible coach." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("finance_transactions").insert({
    nc_club_id: coach.nc_club_id,
    txn_date: input.date,
    direction: input.direction,
    category: input.category,
    amount: input.amount,
    payment_method: input.paymentMethod,
    customer_name: input.direction === "in" ? input.customerName!.trim() : null,
    responsible_coach_id: input.direction === "out" ? input.responsibleCoachId : null,
    recorded_by: coach.id,
  });

  if (error) return { error: error.message };

  revalidatePath("/finance");
  return { success: true };
}
