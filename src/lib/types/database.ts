// Hand-written types mirroring supabase/schema.sql.
// If you change the schema, update this file to match (or regenerate with
// `npx supabase gen types typescript --project-id <id> > src/lib/types/database.ts`
// once the Supabase CLI is linked to your project).
//
// NOTE: Row/Insert/Update types must be declared with `type` (object type
// literals), not `interface`. TypeScript only grants object-literal types an
// implicit index signature for `extends Record<string, unknown>` checks —
// `interface` declarations fail that check (they can be augmented later, so
// TS won't assume they're closed), which silently collapses every
// `.from()/.insert()/.rpc()` call on the Supabase client to `never`.

export type CoachLevel =
  | "SC 35%"
  | "SB 42%"
  | "Supervisor"
  | "World Team"
  | "Active World Team"
  | "GET Team"
  | "GET 2500RO"
  | "Millionaire Team"
  | "MT 7500RO"
  | "President's Team";

export type NcPosition = "Owner" | "Internship" | "NC Partner" | "Junior Coach";

export type CustomerGender = "Male" | "Female" | "Couple" | "Family" | "Others";

export type CustomerNcLevel = "5-day" | "10-day" | "20-day" | "30-day";

export type MemberType = "MB" | "SC" | "SB" | "SP" | "WT" | "AWT" | "TAB";

export type ConsumptionType = "Dine-in" | "Take-away";

export type InvitedByType = "coach" | "customer" | "plugin";

export type NcClub = {
  id: string;
  name: string;
  created_at: string;
};

export type Coach = {
  id: string;
  auth_user_id: string;
  name: string;
  contact: string;
  dob: string;
  sponsor_id: string | null;
  member_id: string;
  level: CoachLevel;
  nc_club_id: string | null;
  nc_position: NcPosition;
  is_admin: boolean;
  active: boolean;
  created_at: string;
};

export type Customer = {
  id: string;
  nc_club_id: string;
  name: string;
  gender: CustomerGender;
  contact: string;
  dob: string;
  age_override: number | null;
  nc_level: CustomerNcLevel;
  consumption_balance: number;
  invited_by_type: InvitedByType;
  invited_by_coach_id: string | null;
  invited_by_customer_id: string | null;
  member_id: string | null;
  member_type: MemberType | null;
  created_by: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type Checkin = {
  id: string;
  customer_id: string;
  nc_club_id: string;
  cups: number;
  consumption_type: ConsumptionType;
  checkin_date: string;
  recorded_by: string | null;
  voided: boolean;
  created_at: string;
};

export type CheckinEdit = {
  id: string;
  checkin_id: string;
  edited_by: string;
  field_changed: string;
  old_value: string | null;
  new_value: string | null;
  reason: string | null;
  created_at: string;
};

export type CustomerRenewal = {
  id: string;
  customer_id: string;
  renewed_by: string;
  nc_level: CustomerNcLevel;
  cups_added: number;
  previous_balance: number;
  new_balance: number;
  created_at: string;
};

export type DailyTotalsRow = {
  total_cups: number;
  plugin_cups: number;
};

export type DailyCoachCupsRow = {
  coach_id: string;
  coach_name: string;
  cups: number;
};

export type UpcomingBirthdayRow = {
  customer_id: string;
  name: string;
  dob: string;
  days_until: number;
};

export type MonthlyTotalsRow = {
  total_cups: number;
  days_in_period: number;
  avg_daily_cups: number;
};

export type MonthlyCoachCupsRow = {
  coach_id: string;
  coach_name: string;
  total_cups: number;
  avg_daily_cups: number;
};

export type BranchClubRow = {
  club_id: string;
  club_name: string;
};

type NoRelationships = {
  Relationships: [];
};

export type Database = {
  public: {
    Tables: {
      nc_clubs: { Row: NcClub; Insert: Partial<NcClub>; Update: Partial<NcClub> } & NoRelationships;
      coaches: { Row: Coach; Insert: Partial<Coach>; Update: Partial<Coach> } & NoRelationships;
      customers: { Row: Customer; Insert: Partial<Customer>; Update: Partial<Customer> } & NoRelationships;
      checkins: { Row: Checkin; Insert: Partial<Checkin>; Update: Partial<Checkin> } & NoRelationships;
      checkin_edits: {
        Row: CheckinEdit;
        Insert: Partial<CheckinEdit>;
        Update: Partial<CheckinEdit>;
      } & NoRelationships;
      customer_renewals: {
        Row: CustomerRenewal;
        Insert: Partial<CustomerRenewal>;
        Update: Partial<CustomerRenewal>;
      } & NoRelationships;
    };
    Views: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
    Functions: {
      record_checkin: {
        Args: {
          p_customer_id: string;
          p_cups: number;
          p_consumption_type: ConsumptionType;
          p_checkin_date: string;
        };
        Returns: Checkin;
      };
      correct_checkin: {
        Args: {
          p_checkin_id: string;
          p_new_cups: number;
          p_new_consumption_type: ConsumptionType;
          p_reason: string;
        };
        Returns: void;
      };
      void_checkin: {
        Args: { p_checkin_id: string; p_reason: string };
        Returns: void;
      };
      renew_customer: {
        Args: { p_customer_id: string; p_nc_level: CustomerNcLevel; p_cups_added: number };
        Returns: Customer;
      };
      daily_totals: {
        Args: { p_date: string; p_club_id?: string | null };
        Returns: DailyTotalsRow[];
      };
      daily_coach_cups: {
        Args: { p_date: string; p_club_id?: string | null };
        Returns: DailyCoachCupsRow[];
      };
      upcoming_birthdays: {
        Args: { p_club_id?: string | null };
        Returns: UpcomingBirthdayRow[];
      };
      monthly_totals: {
        Args: { p_month: string; p_club_id?: string | null };
        Returns: MonthlyTotalsRow[];
      };
      monthly_coach_cups: {
        Args: { p_month: string; p_club_id?: string | null };
        Returns: MonthlyCoachCupsRow[];
      };
      list_branch_clubs: { Args: Record<string, never>; Returns: BranchClubRow[] };
    };
  };
};
