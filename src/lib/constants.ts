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

export const CUSTOMER_GENDERS: CustomerGender[] = ["Male", "Female", "Couple", "Family", "Others"];

export const CUSTOMER_NC_LEVELS: CustomerNcLevel[] = ["5-day", "10-day", "20-day", "30-day"];

export const MEMBER_TYPES: MemberType[] = ["MB", "SC", "SB", "SP", "WT", "AWT", "GET"];

export const CUP_COUNTING_MEMBER_TYPES: MemberType[] = ["MB", "SC", "SB"];

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
};
