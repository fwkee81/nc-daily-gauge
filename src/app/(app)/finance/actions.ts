"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentCoach } from "@/lib/auth";
import type { FinanceCategory, FinanceDirection, FinancePaymentMethod } from "@/lib/types/database";

export interface FinanceTransactionInput {
  date: string;
  direction: FinanceDirection;
  category: FinanceCategory;
  detail: string | null;
  amount: number;
  paymentMethod: FinancePaymentMethod;
  customerName: string | null;
  responsibleCoachId: string | null;
  remark: string | null;
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
  if (!input.responsibleCoachId) {
    return { error: "Please choose the responsible coach." };
  }
  if (input.category === "Others" && !input.detail?.trim()) {
    return { error: "Please specify what this 'Others' entry is." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("finance_transactions").insert({
    nc_club_id: coach.nc_club_id,
    txn_date: input.date,
    direction: input.direction,
    category: input.category,
    detail: input.category === "Others" ? input.detail!.trim() : null,
    amount: input.amount,
    payment_method: input.paymentMethod,
    customer_name: input.direction === "in" ? input.customerName!.trim() : null,
    responsible_coach_id: input.responsibleCoachId,
    remark: input.remark?.trim() || null,
    recorded_by: coach.id,
  });

  if (error) return { error: error.message };

  revalidatePath("/finance");
  return { success: true };
}

export async function voidFinanceTransaction(transactionId: string, reason: string) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("void_finance_transaction", {
    p_transaction_id: transactionId,
    p_reason: reason,
  });

  if (error) return { error: error.message };

  revalidatePath("/finance");
  return { success: true };
}

// Idempotent server-side (see create_invoice() in supabase/schema.sql) —
// safe to call every time the dialog opens, re-clicking never mints a
// second invoice number for the same transaction.
export async function createInvoice(financeTransactionId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_invoice", {
    p_finance_transaction_id: financeTransactionId,
  });

  if (error) return { error: error.message };
  return { success: true, invoice: data };
}

export async function updateInvoiceContact(invoiceId: string, contact: string | null) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("invoices")
    .update({ customer_contact: contact?.trim() || null })
    .eq("id", invoiceId);

  if (error) return { error: error.message };
  return { success: true };
}

export interface InvoiceSettingsInput {
  companyName: string | null;
  address: string | null;
  phone: string | null;
  ssmNo: string | null;
}

export async function updateInvoiceSettings(input: InvoiceSettingsInput) {
  const coach = await getCurrentCoach();
  if (!coach || !coach.is_admin || !coach.nc_club_id) {
    return { error: "Only an admin can edit invoice settings." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("nc_clubs")
    .update({
      invoice_company_name: input.companyName?.trim() || null,
      invoice_address: input.address?.trim() || null,
      invoice_phone: input.phone?.trim() || null,
      invoice_ssm_no: input.ssmNo?.trim() || null,
    })
    .eq("id", coach.nc_club_id);

  if (error) return { error: error.message };

  revalidatePath("/finance");
  revalidatePath("/finance/invoice-settings");
  return { success: true };
}
