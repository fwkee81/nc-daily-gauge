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
          <Card key={branch.club_id}>
            <CardHeader>
              <CardTitle>{branch.club_name}</CardTitle>
              <CardDescription>Read-only — never merged with your own club</CardDescription>
            </CardHeader>
            <div className="flex flex-wrap gap-2 px-6 pb-6">
              <Link
                href={`/reports/daily?club=${branch.club_id}`}
                className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm transition-colors hover:bg-accent"
              >
                Daily Report <ChevronRight className="size-4 text-muted-foreground" />
              </Link>
              <Link
                href={`/reports/metrics?club=${branch.club_id}`}
                className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm transition-colors hover:bg-accent"
              >
                NC Metrics <ChevronRight className="size-4 text-muted-foreground" />
              </Link>
              <Link
                href={`/admin/customers?club=${branch.club_id}`}
                className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm transition-colors hover:bg-accent"
              >
                Customers <ChevronRight className="size-4 text-muted-foreground" />
              </Link>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
