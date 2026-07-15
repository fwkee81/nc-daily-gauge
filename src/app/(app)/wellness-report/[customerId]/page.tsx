import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { differenceInYears, format } from "date-fns";
import { ChevronLeft, User, Stethoscope, Scale, Target, Utensils, Moon } from "lucide-react";
import { getCurrentCoach } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import type { WellnessHealthProfile, WellnessLog } from "@/lib/types/database";
import { WellnessReadingsTable } from "./wellness-readings-table";
import { CollapsibleSection } from "./collapsible-section";

const BUDGET_LABELS: Record<string, string> = {
  rm400: "RM400",
  rm800: "RM800",
  rm1000: "RM1,000",
  rm1500: "RM1,500",
  rm1500_above: "RM1,500+",
};

const WATER_BAND_LABELS: Record<string, string> = {
  lt1l: "< 1L",
  "1l": "1L",
  "2l": "2L",
  "3l": "3L",
  "4l": "4L",
  gt4l: "> 4L",
};

function prettify(value: string | null | undefined): string {
  if (!value) return "—";
  return value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function yesNo(value: boolean | null | undefined): string {
  if (value == null) return "—";
  return value ? "Yes" : "No";
}

function joinList(items: string[] | null | undefined, other?: string | null): string {
  const all = [...(items ?? [])];
  if (other) all.push(other);
  return all.length > 0 ? all.join(", ") : "—";
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("text-sm", value === "—" && "text-muted-foreground/60")}>{value}</p>
    </div>
  );
}

function BigField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("text-base font-semibold", value === "—" && "text-muted-foreground/60 font-normal")}>
        {value}
      </p>
    </div>
  );
}

export default async function WellnessReportDetailPage({
  params,
}: {
  params: Promise<{ customerId: string }>;
}) {
  const coach = await getCurrentCoach();
  if (!coach) redirect("/onboarding");
  if (!coach.is_admin) {
    return (
      <div className="rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
        Only the club Owner or Internship coach can view the Wellness Report.
      </div>
    );
  }

  const { customerId } = await params;
  const supabase = await createClient();

  const [{ data: customer }, { data: profile }, { data: logs }, { data: wellnessUser }] =
    await Promise.all([
      supabase
        .from("customers")
        .select("id, name, contact, dob, age_override, gender, nc_level, active")
        .eq("id", customerId)
        .maybeSingle(),
      supabase
        .from("wellness_health_profiles")
        .select("*")
        .eq("customer_id", customerId)
        .maybeSingle(),
      supabase
        .from("wellness_logs")
        .select("*")
        .eq("customer_id", customerId)
        .order("log_date", { ascending: false }),
      supabase.from("wellness_users").select("customer_id").eq("customer_id", customerId).maybeSingle(),
    ]);

  if (!customer) notFound();

  const healthProfile = profile as unknown as WellnessHealthProfile | null;
  const readings = (logs ?? []) as unknown as WellnessLog[];
  const latest = readings[0] ?? null;
  const earliest = readings[readings.length - 1] ?? null;
  const joinedWellness = Boolean(wellnessUser);

  const age =
    customer.age_override ?? (customer.dob ? differenceInYears(new Date(), new Date(customer.dob)) : null);

  return (
    <div>
      <Link
        href="/wellness-report"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" /> Back to Wellness Report
      </Link>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold">{customer.name}</h1>
        <Badge variant={customer.active ? "secondary" : "destructive"}>
          {customer.active ? "Active" : "Inactive"}
        </Badge>
        {joinedWellness ? (
          <Badge className="text-primary" variant="outline">
            Joined My Wellness
          </Badge>
        ) : (
          <Badge variant="outline" className="text-muted-foreground">
            Not joined My Wellness
          </Badge>
        )}
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        {customer.gender} · {age != null ? `${age} years old` : "Age unknown"} · {customer.contact} ·{" "}
        {customer.nc_level}
      </p>

      <div className="mt-6 space-y-6">
        <div>
          <h2 className="text-lg font-semibold">Overall metrics</h2>
          {!latest ? (
            <p className="mt-2 text-sm text-muted-foreground">
              No readings logged on My Wellness yet.
            </p>
          ) : (
            <div className="mt-2 grid gap-4 sm:grid-cols-2">
              <Card className="border-2 border-primary bg-primary/5">
                <CardHeader>
                  <CardDescription>Latest reading — {format(new Date(latest.log_date), "d MMM yyyy")}</CardDescription>
                </CardHeader>
                <CardContent className="grid grid-cols-3 gap-3">
                  <BigField label="Weight" value={latest.weight_kg != null ? `${latest.weight_kg} kg` : "—"} />
                  <BigField label="Body fat" value={latest.body_fat_pct != null ? `${latest.body_fat_pct}%` : "—"} />
                  <BigField label="Body water" value={latest.body_water_pct != null ? `${latest.body_water_pct}%` : "—"} />
                  <BigField label="Muscle mass" value={latest.muscle_mass_kg != null ? `${latest.muscle_mass_kg} kg` : "—"} />
                  <BigField label="PR" value={latest.physical_rating != null ? String(latest.physical_rating) : "—"} />
                  <BigField label="BMR" value={latest.metabolic_rate != null ? String(latest.metabolic_rate) : "—"} />
                  <BigField label="Age" value={latest.metabolic_age != null ? String(latest.metabolic_age) : "—"} />
                  <BigField label="Bone mass" value={latest.bone_mass_kg != null ? `${latest.bone_mass_kg} kg` : "—"} />
                  <BigField label="Visceral fat" value={latest.visceral_fat != null ? String(latest.visceral_fat) : "—"} />
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardDescription>
                    Change since first reading
                    {earliest && earliest.id !== latest.id && ` (${format(new Date(earliest.log_date), "d MMM yyyy")})`}
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid grid-cols-2 gap-3">
                  <BigField
                    label="Weight"
                    value={
                      earliest && latest.weight_kg != null && earliest.weight_kg != null
                        ? `${(latest.weight_kg - earliest.weight_kg).toFixed(1)} kg`
                        : "—"
                    }
                  />
                  <BigField
                    label="Body fat"
                    value={
                      earliest && latest.body_fat_pct != null && earliest.body_fat_pct != null
                        ? `${(latest.body_fat_pct - earliest.body_fat_pct).toFixed(1)}%`
                        : "—"
                    }
                  />
                </CardContent>
              </Card>
            </div>
          )}
        </div>

        {readings.length > 0 && <WellnessReadingsTable readings={readings} />}

        <div>
          <h2 className="text-lg font-semibold">Health profile</h2>
          {!healthProfile ? (
            <p className="mt-2 text-sm text-muted-foreground">
              This customer hasn&apos;t filled in a health profile on My Wellness yet.
            </p>
          ) : (
            <div className="mt-2 space-y-4">
              <CollapsibleSection title="Basic" icon={User}>
                <Field label="Gender" value={prettify(healthProfile.ref_gender)} />
                <Field label="Height" value={healthProfile.height_cm != null ? `${healthProfile.height_cm} cm` : "—"} />
                <Field label="Goal" value={prettify(healthProfile.goal_type)} />
                <Field label="Goal target weight" value={healthProfile.goal_target_kg != null ? `${healthProfile.goal_target_kg} kg` : "—"} />
              </CollapsibleSection>

              <CollapsibleSection title="Medical" icon={Stethoscope}>
                <Field label="Self-assessment" value={prettify(healthProfile.self_assessment)} />
                <Field label="On medication" value={yesNo(healthProfile.on_medication)} />
                <Field label="Medications" value={healthProfile.medications || "—"} />
                <Field
                  label="Conditions"
                  value={joinList(healthProfile.conditions, healthProfile.conditions_other)}
                />
                <Field label="Smoking" value={yesNo(healthProfile.smoking)} />
                <Field label="Smoking detail" value={healthProfile.smoking_detail || "—"} />
              </CollapsibleSection>

              <CollapsibleSection title="Weight history" icon={Scale}>
                <Field label="Main motive" value={prettify(healthProfile.main_motive)} />
                <Field
                  label="Reasons for overweight"
                  value={joinList(healthProfile.overweight_reasons, healthProfile.overweight_reasons_other)}
                />
                <Field
                  label="Past methods tried"
                  value={joinList(healthProfile.past_methods, healthProfile.past_methods_other)}
                />
                <Field label="Why past methods failed" value={joinList(healthProfile.fail_reasons)} />
              </CollapsibleSection>

              <CollapsibleSection title="Motivation" icon={Target}>
                <Field label="Breakfast motives" value={joinList(healthProfile.breakfast_motives)} />
                <Field label="Weight loss motives" value={joinList(healthProfile.weight_loss_motives)} />
                <Field
                  label="Target size"
                  value={
                    healthProfile.motive_size_from || healthProfile.motive_size_to
                      ? `${healthProfile.motive_size_from ?? "—"} → ${healthProfile.motive_size_to ?? "—"}`
                      : "—"
                  }
                />
                <Field label="Remark" value={healthProfile.weight_loss_motives_remark || "—"} />
                <Field label="Seriousness score" value={healthProfile.seriousness_score != null ? String(healthProfile.seriousness_score) : "—"} />
                <Field
                  label="Monthly budget"
                  value={healthProfile.monthly_budget ? BUDGET_LABELS[healthProfile.monthly_budget] ?? healthProfile.monthly_budget : "—"}
                />
                <Field label="Avg meal spend" value={healthProfile.avg_meal_spend != null ? `RM${healthProfile.avg_meal_spend}` : "—"} />
              </CollapsibleSection>

              <CollapsibleSection title="Eating habits" icon={Utensils} defaultOpen={false}>
                <Field label="Breakfast time" value={healthProfile.breakfast_time || "—"} />
                <Field label="Breakfast choices" value={joinList(healthProfile.breakfast_choices, healthProfile.breakfast_other)} />
                <Field label="Morning tea" value={prettify(healthProfile.morning_tea)} />
                <Field label="Lunch time" value={healthProfile.lunch_time || "—"} />
                <Field label="Lunch choices" value={joinList(healthProfile.lunch_choices, healthProfile.lunch_other)} />
                <Field label="Afternoon tea" value={prettify(healthProfile.afternoon_tea)} />
                <Field label="Dinner time" value={healthProfile.dinner_time || "—"} />
                <Field label="Dinner choices" value={joinList(healthProfile.dinner_choices, healthProfile.dinner_other)} />
                <Field label="Supper" value={prettify(healthProfile.supper)} />
              </CollapsibleSection>

              <CollapsibleSection title="Lifestyle" icon={Moon} defaultOpen={false}>
                <Field label="Most tired time" value={healthProfile.most_tired_time || "—"} />
                <Field label="Hungriest time" value={healthProfile.hungriest_time || "—"} />
                <Field label="Wake time" value={healthProfile.wake_time || "—"} />
                <Field label="Sleep time" value={healthProfile.sleep_time || "—"} />
                <Field label="Daily calorie estimate" value={healthProfile.daily_calorie_estimate != null ? String(healthProfile.daily_calorie_estimate) : "—"} />
                <Field
                  label="Daily water intake"
                  value={healthProfile.daily_water_band ? WATER_BAND_LABELS[healthProfile.daily_water_band] ?? healthProfile.daily_water_band : "—"}
                />
                <Field label="Coffee habit" value={prettify(healthProfile.coffee_habit)} />
                <Field label="Tea / alcohol habit" value={prettify(healthProfile.tea_alcohol_habit)} />
                <Field label="Exercise habit" value={prettify(healthProfile.exercise_habit)} />
                <Field label="Exercise / week" value={healthProfile.exercise_weekly_count != null ? `${healthProfile.exercise_weekly_count}x` : "—"} />
              </CollapsibleSection>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
