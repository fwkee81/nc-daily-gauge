"use client";

import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { updateInvoiceSettings } from "../actions";

export function InvoiceSettingsClient({
  companyName,
  address,
  phone,
  ssmNo,
}: {
  companyName: string;
  address: string;
  phone: string;
  ssmNo: string;
}) {
  const [form, setForm] = useState({ companyName, address, phone, ssmNo });
  const [isPending, setIsPending] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setIsPending(true);
    const result = await updateInvoiceSettings({
      companyName: form.companyName,
      address: form.address,
      phone: form.phone,
      ssmNo: form.ssmNo,
    });
    setIsPending(false);

    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success("Invoice settings saved.");
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-md space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Invoice Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          This appears on the letterhead of every invoice generated from this club&apos;s Finance page.
        </p>
      </div>

      <div className="space-y-1">
        <Label htmlFor="company-name">Company name</Label>
        <Input
          id="company-name"
          value={form.companyName}
          onChange={(e) => setForm((f) => ({ ...f, companyName: e.target.value }))}
          placeholder="e.g. Wellness Plus Sdn Bhd"
        />
      </div>

      <div className="space-y-1">
        <Label htmlFor="address">Address</Label>
        <Textarea
          id="address"
          value={form.address}
          onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
          rows={2}
        />
      </div>

      <div className="space-y-1">
        <Label htmlFor="phone">Phone</Label>
        <Input
          id="phone"
          value={form.phone}
          onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
        />
      </div>

      <div className="space-y-1">
        <Label htmlFor="ssm-no">SSM registration no. (optional)</Label>
        <Input
          id="ssm-no"
          value={form.ssmNo}
          onChange={(e) => setForm((f) => ({ ...f, ssmNo: e.target.value }))}
        />
      </div>

      <Button type="submit" disabled={isPending}>
        {isPending ? "Saving..." : "Save"}
      </Button>
    </form>
  );
}
