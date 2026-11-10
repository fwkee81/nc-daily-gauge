import { redirect } from "next/navigation";
import { getCurrentCoach } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { InvoiceSettingsClient } from "./invoice-settings-client";

export default async function InvoiceSettingsPage() {
  const coach = await getCurrentCoach();
  if (!coach) redirect("/onboarding");
  if (!coach.is_admin || !coach.nc_club_id) {
    return (
      <div className="rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
        Only the club Owner or Internship coach can edit invoice settings.
      </div>
    );
  }

  const supabase = await createClient();
  const { data: club } = await supabase
    .from("nc_clubs")
    .select("invoice_company_name, invoice_address, invoice_phone, invoice_ssm_no")
    .eq("id", coach.nc_club_id)
    .maybeSingle();

  return (
    <InvoiceSettingsClient
      companyName={club?.invoice_company_name ?? ""}
      address={club?.invoice_address ?? ""}
      phone={club?.invoice_phone ?? ""}
      ssmNo={club?.invoice_ssm_no ?? ""}
    />
  );
}
