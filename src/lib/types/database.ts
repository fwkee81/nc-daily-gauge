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

export type CustomerNcLevel = "5-day" | "10-day" | "20-day" | "30-day" | "Ala Carte";

export type MemberType = "MB" | "SC" | "SB" | "SP" | "WT" | "AWT" | "TAB" | "Non member";

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
  dob: string | null;
  age_override: number | null;
  nc_level: CustomerNcLevel;
  consumption_balance: number;
  invited_by_type: InvitedByType;
  invited_by_coach_id: string | null;
  invited_by_customer_id: string | null;
  coach_id: string | null;
  member_id: string | null;
  member_type: MemberType | null;
  remark: string | null;
  is_pjs: boolean;
  is_health_ambassador: boolean;
  created_by: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type CustomerMember = {
  id: string;
  customer_id: string;
  name: string;
  contact: string | null;
  dob: string | null;
  active: boolean;
  created_at: string;
};

export type Checkin = {
  id: string;
  customer_id: string;
  member_id: string | null;
  nc_club_id: string;
  cups: number;
  consumption_type: ConsumptionType;
  checkin_date: string;
  recorded_by: string | null;
  voided: boolean;
  is_birthday_shake: boolean;
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
  reason: string | null;
  created_at: string;
};

export type DailyReportLog = {
  id: string;
  nc_club_id: string;
  log_date: string;
  note: string;
  created_by_coach_id: string | null;
  created_at: string;
};

export type InventoryDirection = "in" | "out";

export type Product = {
  id: string;
  name: string;
  vp: number;
  active: boolean;
  created_at: string;
};

export type InventoryTransaction = {
  id: string;
  nc_club_id: string;
  product_id: string;
  direction: InventoryDirection;
  quantity: number;
  txn_date: string;
  customer_id: string | null;
  recorded_by: string | null;
  remark: string | null;
  created_at: string;
  voided: boolean;
  voided_by: string | null;
  void_reason: string | null;
  voided_at: string | null;
};

export type InventoryStockLevelRow = {
  product_id: string;
  product_name: string;
  vp: number;
  on_hand: number;
};

export type DailyTotalsRow = {
  total_cups: number;
  plugin_cups: number;
  coach_cup_total: number;
  dine_in_cups: number;
  takeaway_cups: number;
};

export type DailyCoachCupsRow = {
  coach_id: string;
  coach_name: string;
  cups: number;
};

export type DailyBranchCoachCupsRow = {
  coach_id: string;
  coach_name: string;
  coach_club_name: string | null;
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

export type MonthlyPackageSaleRow = {
  nc_level: string;
  coach_id: string | null;
  coach_name: string | null;
  customer_id: string;
  customer_name: string;
  entry_date: string;
  kind: "new" | "renewed";
  invited_by_type: InvitedByType;
};

export type MonthlyInventoryOutRow = {
  product_id: string;
  product_name: string;
  vp: number;
  qty: number;
  total_vp: number;
};

export type BranchClubRow = {
  club_id: string;
  club_name: string;
};

export type BranchDailySummaryRow = {
  club_id: string;
  club_name: string;
  total_cups: number;
  prev_total_cups: number;
  coach_cup_total: number;
  prev_coach_cup_total: number;
  consumption_vp: number;
  prev_consumption_vp: number;
  new_5day: number;
  prev_new_5day: number;
  total_10day: number;
  prev_total_10day: number;
  total_20day: number;
  prev_total_20day: number;
  total_30day: number;
  prev_total_30day: number;
  prev_date: string | null;
};

export type BranchDailyRemarkRow = {
  club_id: string;
  note: string;
  created_by_coach_name: string | null;
  created_at: string;
};

export type BranchWeeklyDailyRow = {
  date: string;
  total_cups: number;
  coach_cup_total: number;
};

export type BranchWeeklySummaryRow = {
  club_id: string;
  club_name: string;
  operating_days: number;
  window_start: string | null;
  window_end: string | null;
  total_cups: number;
  coach_cup_total: number;
  consumption_vp: number;
  total_5day: number;
  total_10day: number;
  total_20day: number;
  total_30day: number;
  daily: BranchWeeklyDailyRow[];
};

export type BranchCoachCupsCompareRow = {
  club_id: string;
  coach_id: string;
  coach_name: string;
  cups: number;
  prev_cups: number;
};

export type BranchMonthlySummaryRow = {
  club_id: string;
  club_name: string;
  operating_days: number;
  avg_daily_cups: number;
  coach_cup_avg_daily: number;
  consumption_vp: number;
  total_5day: number;
  total_10day: number;
  total_20day: number;
  total_30day: number;
};

export type BranchLeaderboardBoard = "new_5day" | "total_30day" | "coach_cup_avg";

export type BranchLeaderboardRow = {
  board: BranchLeaderboardBoard;
  coach_id: string;
  coach_name: string;
  club_id: string;
  club_name: string;
  value: number;
};

// Owned by the separate "My Wellness" customer-facing app (own repo at
// C:\Users\PC\Desktop\my-wellness), not by NC Daily Gauge — but it lives in
// the same Supabase project and rows are linked back to this app's
// `customers` table via customer_id. NC Daily Gauge only ever READS these
// tables (to show a customer's self-logged wellness data on the Wellness
// Report page); the tables, RLS, and all writes are managed entirely by the
// My Wellness repo. Not declared in schema.sql for that reason — this is
// just enough typing for typed .from("wellness_*") reads here.
export type WellnessLog = {
  id: string;
  customer_id: string | null;
  coach_id: string | null;
  log_date: string;
  weight_kg: number | null;
  body_fat_pct: number | null;
  body_water_pct: number | null;
  muscle_mass_kg: number | null;
  physical_rating: number | null;
  metabolic_rate: number | null;
  metabolic_age: number | null;
  bone_mass_kg: number | null;
  visceral_fat: number | null;
  water_intake_ml: number;
  exercised: boolean;
  exercise_minutes: number;
  exercise_notes: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type WellnessUser = {
  auth_user_id: string;
  customer_id: string;
  created_at: string;
};

export type WellnessHealthProfile = {
  id: string;
  customer_id: string | null;
  coach_id: string | null;
  ref_gender: "female" | "male" | null;
  height_cm: number | null;
  goal_type: "loss" | "gain" | null;
  goal_target_kg: number | null;
  conditions: string[];
  conditions_other: string | null;
  medications: string | null;
  updated_at: string;

  self_assessment: "healthy" | "not_very_healthy" | "unhealthy" | null;
  on_medication: boolean | null;
  exercise_habit: "none" | "daily" | "weekly" | null;
  exercise_weekly_count: number | null;
  overweight_reasons: string[];
  overweight_reasons_other: string | null;
  past_methods: string[];
  past_methods_other: string | null;
  fail_reasons: string[];
  main_motive: "health_care" | "weight_gain" | "weight_loss" | null;

  breakfast_motives: string[];
  weight_loss_motives: string[];
  motive_size_from: string | null;
  motive_size_to: string | null;
  weight_loss_motives_remark: string | null;
  seriousness_score: number | null;
  monthly_budget: "rm400" | "rm800" | "rm1000" | "rm1500" | "rm1500_above" | null;
  avg_meal_spend: number | null;

  breakfast_time: string | null;
  breakfast_choices: string[];
  breakfast_other: string | null;
  morning_tea: "none" | "yes" | "occasionally" | null;
  lunch_time: string | null;
  lunch_choices: string[];
  lunch_other: string | null;
  afternoon_tea: "none" | "yes" | "occasionally" | null;
  dinner_time: string | null;
  dinner_choices: string[];
  dinner_other: string | null;
  supper: "none" | "yes" | "occasionally" | null;

  most_tired_time: string | null;
  hungriest_time: string | null;
  wake_time: string | null;
  sleep_time: string | null;
  daily_calorie_estimate: number | null;
  daily_water_band: "lt1l" | "1l" | "2l" | "3l" | "4l" | "gt4l" | null;
  coffee_habit: "none" | "daily" | "weekly" | "occasionally" | null;
  tea_alcohol_habit: "none" | "daily" | "weekly" | "occasionally" | null;
  smoking: boolean | null;
  smoking_detail: string | null;
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
      daily_report_logs: {
        Row: DailyReportLog;
        Insert: Partial<DailyReportLog>;
        Update: Partial<DailyReportLog>;
      } & NoRelationships;
      customer_members: {
        Row: CustomerMember;
        Insert: Partial<CustomerMember>;
        Update: Partial<CustomerMember>;
      } & NoRelationships;
      // Owned by the My Wellness app — see the comment on WellnessLog above.
      wellness_logs: {
        Row: WellnessLog;
        Insert: Partial<WellnessLog>;
        Update: Partial<WellnessLog>;
      } & NoRelationships;
      wellness_users: {
        Row: WellnessUser;
        Insert: Partial<WellnessUser>;
        Update: Partial<WellnessUser>;
      } & NoRelationships;
      wellness_health_profiles: {
        Row: WellnessHealthProfile;
        Insert: Partial<WellnessHealthProfile>;
        Update: Partial<WellnessHealthProfile>;
      } & NoRelationships;
      products: { Row: Product; Insert: Partial<Product>; Update: Partial<Product> } & NoRelationships;
      inventory_transactions: {
        Row: InventoryTransaction;
        Insert: Partial<InventoryTransaction>;
        Update: Partial<InventoryTransaction>;
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
          p_member_id?: string | null;
          p_is_birthday_shake?: boolean;
        };
        Returns: Checkin;
      };
      correct_checkin: {
        Args: {
          p_checkin_id: string;
          p_new_cups: number;
          p_new_consumption_type: ConsumptionType;
          p_reason: string;
          p_new_is_birthday_shake?: boolean;
        };
        Returns: void;
      };
      void_checkin: {
        Args: { p_checkin_id: string; p_reason: string };
        Returns: void;
      };
      renew_customer: {
        Args: {
          p_customer_id: string;
          p_nc_level: CustomerNcLevel;
          p_cups_added: number;
          p_reason?: string | null;
        };
        Returns: Customer;
      };
      record_walkin_checkin: {
        Args: {
          p_name: string;
          p_contact: string;
          p_invited_by_type: InvitedByType;
          p_invited_by_coach_id: string | null;
          p_invited_by_customer_id: string | null;
          p_consumption_type: ConsumptionType;
          p_checkin_date: string;
        };
        Returns: Checkin;
      };
      coach_cup_excluded_customer_ids: {
        Args: { p_club_id?: string | null };
        Returns: { customer_id: string }[];
      };
      plugin_lineage_customer_ids: {
        Args: { p_club_id?: string | null };
        Returns: { customer_id: string }[];
      };
      daily_totals: {
        Args: { p_date: string; p_club_id?: string | null };
        Returns: DailyTotalsRow[];
      };
      daily_coach_cups: {
        Args: { p_date: string; p_club_id?: string | null };
        Returns: DailyCoachCupsRow[];
      };
      daily_branch_coach_cups: {
        Args: { p_date: string; p_club_id?: string | null };
        Returns: DailyBranchCoachCupsRow[];
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
      monthly_package_sales: {
        Args: { p_month: string; p_club_id?: string | null };
        Returns: MonthlyPackageSaleRow[];
      };
      monthly_inventory_out: {
        Args: { p_month: string; p_club_id?: string | null };
        Returns: MonthlyInventoryOutRow[];
      };
      list_branch_clubs: { Args: Record<string, never>; Returns: BranchClubRow[] };
      branches_daily_summary: {
        Args: { p_date: string };
        Returns: BranchDailySummaryRow[];
      };
      branches_daily_remarks: {
        Args: { p_date: string };
        Returns: BranchDailyRemarkRow[];
      };
      branches_weekly_summary: {
        Args: { p_date?: string };
        Returns: BranchWeeklySummaryRow[];
      };
      branches_coach_cups_compare: {
        Args: { p_date: string };
        Returns: BranchCoachCupsCompareRow[];
      };
      branches_monthly_summary: {
        Args: { p_month: string };
        Returns: BranchMonthlySummaryRow[];
      };
      branches_monthly_leaderboards: {
        Args: { p_month: string };
        Returns: BranchLeaderboardRow[];
      };
      visible_club_ids: {
        Args: { p_coach_id: string };
        Returns: { visible_club_ids: string }[];
      };
      list_visible_club_ids: {
        Args: { p_coach_id: string };
        Returns: { club_id: string }[];
      };
      inventory_stock_levels: {
        Args: Record<string, never>;
        Returns: InventoryStockLevelRow[];
      };
      void_inventory_transaction: {
        Args: { p_transaction_id: string; p_reason: string };
        Returns: void;
      };
    };
  };
};
