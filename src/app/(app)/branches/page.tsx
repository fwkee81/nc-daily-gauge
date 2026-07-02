import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { getCurrentCoach } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { BranchClubRow } from "@/lib/types/database";

export default async function BranchesPage() {
  const coach = await getCurrentCoach();
  if (!coach) redirect("/onboarding");
  if (!coach.is_admin) {
    return (
      <div className="rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
        Only the club Owner or Internship coach can view branch clubs.
      </div>
    );
  }

  const supabase = await createClient();
  const { data } = await supabase.rpc("list_branch_clubs");
  const branches = (data ?? []) as BranchClubRow[];

  return (
    <div>
      <h1 className="text-2xl font-semibold">Branches</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Nutrition clubs whose Owner named you as their sponsor. Each branch&apos;s numbers are
        shown on their own — never merged with your own club.
      </p>

      <div className="mt-6 space-y-3">
        {branches.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No branches yet. Once another club&apos;s Owner registers and picks you as their
            sponsor, they&apos;ll show up here.
          </p>
        )}
        {branches.map((branch) => (
          <Link key={branch.club_id} href={`/reports/daily?club=${branch.club_id}`}>
            <Card className="transition-colors hover:bg-accent/50">
              <CardHeader className="flex-row items-center justify-between space-y-0">
                <div>
                  <CardTitle>{branch.club_name}</CardTitle>
                  <CardDescription>View Daily Report &amp; NC Metrics</CardDescription>
                </div>
                <ChevronRight className="size-5 text-muted-foreground" />
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
