import { redirect } from "next/navigation";
import { getCurrentCoach } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { LoyaltyEarnRule, LoyaltyPointsLedgerEntry, LoyaltyReward, LoyaltySettings } from "@/lib/types/database";
import { LoyaltyClient, type LoyaltyCustomerRow } from "./loyalty-client";

export default async function LoyaltyPage() {
  const coach = await getCurrentCoach();
  if (!coach) redirect("/onboarding");
  if (!coach.nc_club_id) {
    return (
      <div className="rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
        Join a club before using the Loyalty Program.
      </div>
    );
  }

  const supabase = await createClient();

  const [{ data: settings }, { data: earnRules }, { data: rewards }, { data: customers }, { data: recentActivity }] =
    await Promise.all([
      supabase.from("loyalty_settings").select("*").eq("nc_club_id", coach.nc_club_id).maybeSingle(),
      supabase
        .from("loyalty_earn_rules")
        .select("*")
        .eq("nc_club_id", coach.nc_club_id)
        .order("created_at"),
      supabase.from("loyalty_rewards").select("*").eq("nc_club_id", coach.nc_club_id).order("created_at"),
      // Eligible customers only — 5-Day/Ala Carte never appear here since
      // they can never earn or hold points (see award_loyalty_points()/
      // redeem_loyalty_reward() in supabase/schema.sql for the same rule
      // enforced server-side).
      supabase
        .from("customers")
        .select("id, name, nc_level, loyalty_points_balance")
        .eq("nc_club_id", coach.nc_club_id)
        .eq("active", true)
        .in("nc_level", ["10-day", "20-day", "30-day"])
        .order("name"),
      supabase
        .from("loyalty_points_ledger")
        .select("*, customer:customers(name)")
        .eq("nc_club_id", coach.nc_club_id)
        .order("created_at", { ascending: false })
        .limit(30),
    ]);

  return (
    <LoyaltyClient
      isAdmin={coach.is_admin}
      settings={(settings as LoyaltySettings | null) ?? null}
      earnRules={(earnRules ?? []) as LoyaltyEarnRule[]}
      rewards={(rewards ?? []) as LoyaltyReward[]}
      customers={(customers ?? []) as LoyaltyCustomerRow[]}
      recentActivity={
        (recentActivity ?? []) as unknown as (LoyaltyPointsLedgerEntry & { customer: { name: string } | null })[]
      }
    />
  );
}
