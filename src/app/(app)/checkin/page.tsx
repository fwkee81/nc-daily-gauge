import { redirect } from "next/navigation";
import { getCurrentCoach } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { CheckinClient } from "./checkin-client";

export default async function CheckinPage() {
  const coach = await getCurrentCoach();
  if (!coach) redirect("/onboarding");

  const supabase = await createClient();
  const { data: customers } = await supabase
    .from("customers")
    .select("id, name, contact, dob, consumption_balance")
    .eq("nc_club_id", coach.nc_club_id ?? "")
    .eq("active", true)
    .order("name");

  return <CheckinClient customers={customers ?? []} />;
}
