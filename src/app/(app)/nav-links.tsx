"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export function NavLinks({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();

  const links = [
    { href: "/dashboard", label: "Dashboard" },
    { href: "/checkin", label: "Check-in" },
    { href: "/reports/daily", label: "Daily Report" },
    { href: "/reports/metrics", label: "NC Metrics" },
    ...(isAdmin
      ? [
          { href: "/admin/customers", label: "Customers" },
          { href: "/admin/coaches", label: "Coaches" },
          { href: "/branches", label: "Branches" },
          { href: "/wellness-report", label: "Wellness Report" },
        ]
      : []),
  ];

  return (
    <nav className="flex flex-wrap gap-1">
      {links.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          className={cn(
            "rounded-full px-3 py-1.5 text-sm font-medium transition-colors hover:bg-accent",
            pathname === link.href
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground"
          )}
        >
          {link.label}
        </Link>
      ))}
    </nav>
  );
}
