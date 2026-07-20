import type {
  CoachLevel,
  ConsumptionType,
  CustomerGender,
  CustomerNcLevel,
  MemberType,
  NcPosition,
} from "@/lib/types/database";

export const COACH_LEVELS: CoachLevel[] = [
  "SC 35%",
  "SB 42%",
  "Supervisor",
  "World Team",
  "Active World Team",
  "GET Team",
  "GET 2500RO",
  "Millionaire Team",
  "MT 7500RO",
  "President's Team",
];

export const NC_POSITIONS: NcPosition[] = ["Owner", "Internship", "NC Partner", "Junior Coach"];

export const ADMIN_POSITIONS: NcPosition[] = ["Owner", "Internship"];

// The one account allowed to edit/deactivate any coach across the whole
// network (including downline branches). Mirrors is_super_admin() in
// supabase/schema.sql — keep these in sync.
export const SUPER_ADMIN_EMAIL = "fwkee81@gmail.com";

export const CUSTOMER_GENDERS: CustomerGender[] = ["Male", "Female", "Couple", "Family", "Others"];

export const CUSTOMER_NC_LEVELS: CustomerNcLevel[] = [
  "5-day",
  "10-day",
  "20-day",
  "30-day",
  "Ala Carte",
];

export const MEMBER_TYPES: MemberType[] = [
  "MB",
  "SC",
  "SB",
  "SP",
  "WT",
  "AWT",
  "TAB",
  "Non member",
];

// Coach's Cup counts any customer with an inviting coach EXCEPT these member
// types (a null/unset member_type still counts), AND excludes a customer
// invited by another customer whose own member_type is one of these, even if
// the invitee's own member_type would otherwise qualify. Mirrors the WHERE
// clause in daily_totals / daily_coach_cups / monthly_coach_cups in
// supabase/schema.sql — not read by the app directly, kept here for
// reference.
export const COACH_CUP_EXCLUDED_MEMBER_TYPES: MemberType[] = ["SP", "WT", "AWT", "TAB"];

export const CONSUMPTION_TYPES: ConsumptionType[] = ["Dine-in", "Take-away"];

export const RENEWAL_REMINDER_THRESHOLD = 4;

// ASSUMPTION: an NC level's day-count maps 1:1 to cups added on renewal
// (e.g. renewing a "10-day" card adds 10 cups). Editable in the renew
// dialog in case a customer's actual package differs.
export const NC_LEVEL_CUPS: Record<CustomerNcLevel, number> = {
  "5-day": 5,
  "10-day": 10,
  "20-day": 20,
  "30-day": 30,
  "Ala Carte": 1,
};
