"use client";

import { useEffect, useRef, useState } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { WhatsAppLink } from "@/components/whatsapp-link";
import { buildPdfFromElement, downloadFile } from "@/lib/pdf";
import type { Invoice } from "@/lib/types/database";
import { createInvoice, updateInvoiceContact } from "./actions";

interface ClubLetterhead {
  companyName: string | null;
  address: string | null;
  phone: string | null;
  ssmNo: string | null;
}

export function InvoiceDialog({
  financeTransactionId,
  clubName,
  letterhead,
  open,
  onOpenChange,
}: {
  financeTransactionId: string;
  clubName: string;
  letterhead: ClubLetterhead;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [contact, setContact] = useState("");
  const [isDownloading, setIsDownloading] = useState(false);
  const previewRef = useRef<HTMLDivElement>(null);

  // create_invoice() is idempotent (see supabase/schema.sql) — reopening
  // the dialog on the same transaction returns the same invoice number
  // instead of minting a new one. No reset of invoice/error state needed
  // here — the dialog is only ever mounted fresh (see the `invoiceTarget &&`
  // conditional render in finance-client.tsx), so state already starts null.
  useEffect(() => {
    if (!open) return;
    createInvoice(financeTransactionId).then((result) => {
      if (result.error) {
        setError(result.error);
        return;
      }
      if (result.invoice) {
        setInvoice(result.invoice);
        setContact(result.invoice.customer_contact ?? "");
      }
    });
  }, [open, financeTransactionId]);

  async function handleContactBlur() {
    if (!invoice) return;
    const trimmed = contact.trim();
    if (trimmed === (invoice.customer_contact ?? "")) return;
    const result = await updateInvoiceContact(invoice.id, trimmed || null);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    setInvoice((prev) => (prev ? { ...prev, customer_contact: trimmed || null } : prev));
  }

  async function handleDownload() {
    if (!invoice || !previewRef.current) return;
    setIsDownloading(true);
    try {
      const file = await buildPdfFromElement(
        previewRef.current,
        `Invoice_${String(invoice.invoice_number).padStart(4, "0")}.pdf`
      );
      downloadFile(file);
    } catch {
      toast.error("Could not generate the PDF.");
    } finally {
      setIsDownloading(false);
    }
  }

  const waText = invoice
    ? `Hi ${invoice.customer_name}, here's your invoice #${String(invoice.invoice_number).padStart(4, "0")} for RM ${invoice.amount.toFixed(2)} (${invoice.category}). 📎 Attaching the PDF now.`
    : "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Invoice</DialogTitle>
        </DialogHeader>

        {error && <p className="text-sm text-destructive">{error}</p>}

        {!invoice && !error && <div className="h-64 animate-pulse rounded-md bg-muted" />}

        {invoice && (
          <>
            <div ref={previewRef} className="space-y-4 rounded-md border bg-card p-6 text-sm">
              <div>
                <p className="text-lg font-semibold">{letterhead.companyName || clubName}</p>
                {letterhead.address && (
                  <p className="whitespace-pre-wrap text-muted-foreground">{letterhead.address}</p>
                )}
                {letterhead.phone && <p className="text-muted-foreground">Tel: {letterhead.phone}</p>}
                {letterhead.ssmNo && <p className="text-muted-foreground">SSM No: {letterhead.ssmNo}</p>}
              </div>

              <div className="flex items-center justify-between border-y py-2">
                <div>
                  <p className="font-semibold">INVOICE</p>
                  <p className="text-muted-foreground">No. {String(invoice.invoice_number).padStart(4, "0")}</p>
                </div>
                <p className="text-muted-foreground">{format(new Date(invoice.txn_date), "d MMM yyyy")}</p>
              </div>

              <div>
                <p className="text-xs text-muted-foreground">Billed to</p>
                <p className="font-medium">{invoice.customer_name}</p>
                {contact && <p className="text-muted-foreground">{contact}</p>}
              </div>

              <table className="w-full text-left">
                <thead>
                  <tr className="border-b">
                    <th className="pb-1 font-medium">Description</th>
                    <th className="pb-1 text-right font-medium">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="py-2">
                      {invoice.category === "Others" && invoice.detail
                        ? `Others — ${invoice.detail}`
                        : invoice.category}
                    </td>
                    <td className="py-2 text-right">RM {invoice.amount.toFixed(2)}</td>
                  </tr>
                </tbody>
              </table>

              <div className="flex items-center justify-between border-t pt-2 font-semibold">
                <span>Total</span>
                <span>RM {invoice.amount.toFixed(2)}</span>
              </div>

              <p className="text-xs text-muted-foreground">Paid via {invoice.payment_method}</p>
            </div>

            <div className="space-y-1">
              <Label htmlFor="invoice-contact">Customer contact (for WhatsApp)</Label>
              <Input
                id="invoice-contact"
                value={contact}
                onChange={(e) => setContact(e.target.value)}
                onBlur={handleContactBlur}
                placeholder="e.g. 0123456789"
              />
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Button onClick={handleDownload} disabled={isDownloading}>
                {isDownloading ? "Preparing..." : "Download PDF"}
              </Button>
              <WhatsAppLink contact={contact} text={waText} className="text-sm" />
            </div>
            <p className="text-xs text-muted-foreground">
              Download the PDF first, then attach it in the WhatsApp chat that opens — a WhatsApp link can&apos;t
              attach a file automatically.
            </p>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
