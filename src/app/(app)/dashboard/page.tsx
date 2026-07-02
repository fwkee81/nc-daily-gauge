import Link from "next/link";
import { Coffee, CalendarDays, TrendingUp, type LucideIcon } from "lucide-react";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { getCurrentCoach } from "@/lib/auth";

export default async function DashboardPage() {
  const coach = await getCurrentCoach();

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
  ];

  return (
    <div>
      <h1 className="text-2xl">Welcome, {coach?.name}</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {coach?.nc_position} · {coach?.level}
      </p>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        {tiles.map((tile) => (
          <Link key={tile.href} href={tile.href}>
            <Card className="h-full transition-colors hover:bg-accent/50">
              <CardHeader>
                <span
                  className={cn(
                    "mb-2 flex size-10 items-center justify-center rounded-xl",
                    tile.tint
                  )}
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
    </div>
  );
}
