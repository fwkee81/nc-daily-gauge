import Link from "next/link";
import {
  Coffee,
  CalendarDays,
  TrendingUp,
  Users,
  Building2,
  Calculator,
  HeartPulse,
  Activity,
  type LucideIcon,
} from "lucide-react";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { getCurrentCoach } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function DashboardPage() {
  const coach = await getCurrentCoach();

  let clubName: string | null = null;
  if (coach?.nc_club_id) {
    const supabase = await createClient();
    const { data: club } = await supabase
      .from("nc_clubs")
      .select("name")
      .eq("id", coach.nc_club_id)
      .maybeSingle();
    clubName = club?.name ?? null;
  }

  const tiles: {
    href: string;
    title: string;
    description: string;
    icon: LucideIcon;
    tint: string;
  }[] = [
    {
      href: "/checkin",
      title: "Check-in",
      description: "Search a customer and record today's check-in.",
      icon: Coffee,
      tint: "bg-primary/15 text-primary",
    },
    {
      href: "/reports/daily",
      title: "Daily Report",
      description: "Today's total cups, coach cups, plug-ins, and upcoming birthdays.",
      icon: CalendarDays,
      tint: "bg-secondary/25 text-[#8a5a00]",
    },
    {
      href: "/reports/metrics",
      title: "NC Metrics",
      description: "Monthly totals and averages, by club and by coach.",
      icon: TrendingUp,
      tint: "bg-primary/15 text-primary",
    },
    ...(coach?.is_admin
      ? [
          {
            href: "/admin/customers",
            title: "Customers",
            description: "Manage customer profiles, balances, and renewals.",
            icon: Users,
            tint: "bg-secondary/25 text-[#8a5a00]",
          },
          {
            href: "/branches",
            title: "Branches",
            description: "View Daily Report, NC Metrics, and Customers for sponsored branches.",
            icon: Building2,
            tint: "bg-primary/15 text-primary",
          },
          {
            href: "/wellness-report",
            title: "Wellness Report",
            description: "Each customer's My Wellness health profile and readings history.",
            icon: Activity,
            tint: "bg-secondary/25 text-[#8a5a00]",
          },
        ]
      : []),
  ];

  const toolTiles: typeof tiles = [
    {
      href: "/tools/product-calculator",
      title: "Product Calculator",
      description: "Look up Herbalife product prices and VP by price tier.",
      icon: Calculator,
      tint: "bg-secondary/25 text-[#8a5a00]",
    },
    {
      href: "/tools/wellness-evaluation",
      title: "Wellness Evaluation",
      description: "Generate a body composition report from Tanita readings.",
      icon: HeartPulse,
      tint: "bg-primary/15 text-primary",
    },
  ];

  return (
    <div>
      <h1 className="text-2xl">Welcome, {coach?.name}</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {coach?.nc_position} · {coach?.level}
        {clubName && <> · {clubName}</>}
      </p>

      <TileGrid tiles={tiles} />

      <h2 className="mt-8 text-lg font-semibold">Tools</h2>
      <TileGrid tiles={toolTiles} />
    </div>
  );
}

function TileGrid({
  tiles,
}: {
  tiles: { href: string; title: string; description: string; icon: LucideIcon; tint: string }[];
}) {
  return (
    <div className="mt-4 grid gap-4 sm:grid-cols-3">
      {tiles.map((tile) => (
        <Link key={tile.href} href={tile.href}>
          <Card className="h-full transition-colors hover:bg-accent/50">
            <CardHeader>
              <span
                className={cn("mb-2 flex size-10 items-center justify-center rounded-xl", tile.tint)}
              >
                <tile.icon className="size-5" strokeWidth={2.25} />
              </span>
              <CardTitle>{tile.title}</CardTitle>
              <CardDescription>{tile.description}</CardDescription>
            </CardHeader>
          </Card>
        </Link>
      ))}
    </div>
  );
}
