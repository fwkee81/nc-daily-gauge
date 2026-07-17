import * as XLSX from "xlsx";
import { format } from "date-fns";
import { getCurrentCoach } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const coach = await getCurrentCoach();
  if (!coach || !coach.is_admin || !coach.nc_club_id) {
    return new Response("Not authorized.", { status: 403 });
  }

  const clubId = coach.nc_club_id;
  const supabase = await createClient();

  const { data: customers } = await supabase
    .from("customers")
    .select(
      "id, name, gender, contact, dob, age_override, nc_level, consumption_balance, member_id, member_type, invited_by_type, invited_by_coach_id, invited_by_customer_id, remark, is_pjs, is_health_ambassador, active, created_at, coach:coaches!customers_coach_id_fkey(name), invited_by_coach:coaches!customers_invited_by_coach_id_fkey(name)"
    )
    .eq("nc_club_id", clubId)
    .order("name");

  const customerRows = (customers ?? []) as unknown as {
    id: string;
    name: string;
    gender: string;
    contact: string;
    dob: string | null;
    age_override: number | null;
    nc_level: string;
    consumption_balance: number;
    member_id: string | null;
    member_type: string | null;
    invited_by_type: string;
    invited_by_coach_id: string | null;
    invited_by_customer_id: string | null;
    remark: string | null;
    is_pjs: boolean;
    is_health_ambassador: boolean;
    active: boolean;
    created_at: string;
    coach: { name: string } | null;
    invited_by_coach: { name: string } | null;
  }[];

  // invited_by_customer is self-referential — PostgREST can't embed it
  // (PGRST200), same reasoning as admin/customers/page.tsx. Resolve it from
  // the same result set instead.
  const nameById = new Map(customerRows.map((c) => [c.id, c.name]));
  const customerIds = customerRows.map((c) => c.id);

  const [{ data: members }, { data: checkins }, { data: coaches }] = await Promise.all([
    supabase
      .from("customer_members")
      .select("id, name, contact, dob, active, customer_id")
      .in("customer_id", customerIds.length > 0 ? customerIds : [""])
      .order("name"),
    supabase
      .from("checkins")
      .select(
        "checkin_date, cups, consumption_type, voided, is_birthday_shake, customer_id, member_id, recorded_by"
      )
      .eq("nc_club_id", clubId)
      .order("checkin_date", { ascending: false }),
    supabase.from("coaches").select("id, name"),
  ]);

  const coachNameById = new Map((coaches ?? []).map((c) => [c.id, c.name]));
  const memberNameById = new Map((members ?? []).map((m) => [m.id, m.name]));

  const customersSheet = customerRows.map((c) => ({
    ID: c.id,
    Name: c.name,
    Gender: c.gender,
    Contact: c.contact,
    DOB: c.dob ?? "",
    "Age Override": c.age_override ?? "",
    "NC Level": c.nc_level,
    "Consumption Balance": c.consumption_balance,
    "Member ID": c.member_id ?? "",
    "Member Type": c.member_type ?? "",
    Coach: c.coach?.name ?? "",
    "Invited By Type": c.invited_by_type,
    "Invited By Coach": c.invited_by_coach?.name ?? "",
    "Invited By Customer": c.invited_by_customer_id
      ? nameById.get(c.invited_by_customer_id) ?? ""
      : "",
    Remark: c.remark ?? "",
    PJS: c.is_pjs ? "Yes" : "No",
    "Health Ambassador": c.is_health_ambassador ? "Yes" : "No",
    Active: c.active ? "Yes" : "No",
    "Created At": c.created_at,
  }));

  const membersSheet = (members ?? []).map((m) => ({
    Customer: nameById.get(m.customer_id) ?? "",
    Name: m.name,
    Contact: m.contact ?? "",
    DOB: m.dob ?? "",
    Active: m.active ? "Yes" : "No",
  }));

  const checkinsSheet = (checkins ?? []).map((c) => ({
    Date: c.checkin_date,
    Customer: nameById.get(c.customer_id) ?? "",
    Member: c.member_id ? memberNameById.get(c.member_id) ?? "" : "",
    Cups: c.cups,
    Type: c.consumption_type,
    Voided: c.voided ? "Yes" : "No",
    "Birthday Shake": c.is_birthday_shake ? "Yes" : "No",
    "Recorded By": c.recorded_by ? coachNameById.get(c.recorded_by) ?? "" : "",
  }));

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(customersSheet), "Customers");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(membersSheet), "Family Members");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(checkinsSheet), "Check-ins");

  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as unknown as Buffer;
  const filename = `customer-backup-${format(new Date(), "yyyy-MM-dd")}.xlsx`;

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
