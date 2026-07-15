"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

const PRIMARY_LINKS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/checkin", label: "Check-in" },
  { href: "/reports/daily", label: "Daily Report" },
  { href: "/reports/metrics", label: "NC Metrics" },
];

const ADMIN_LINKS = [
  { href: "/admin/customers", label: "Customers" },
  { href: "/admin/coaches", label: "Coaches" },
  { href: "/branches", label: "Branches" },
  { href: "/wellness-report", label: "Wellness Report" },
];

function pillClass(active: boolean) {
  return cn(
    "rounded-full px-3 py-1.5 text-sm font-medium transition-colors hover:bg-accent",
    active ? "bg-primary text-primary-foreground" : "text-muted-foreground"
  );
}

export function NavLinks({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();
  const inAdminGroup = ADMIN_LINKS.some((link) => pathname.startsWith(link.href));

  return (
    <nav className="flex flex-wrap items-center gap-1">
      {PRIMARY_LINKS.map((link) => (
        <Link key={link.href} href={link.href} className={pillClass(pathname === link.href)}>
          {link.label}
        </Link>
      ))}

      {isAdmin && (
        <Popover>
          <PopoverTrigger
            render={
              <button type="button" className={cn(pillClass(inAdminGroup), "flex items-center gap-1")} />
            }
          >
            Admin <ChevronDown className="size-3.5" />
          </PopoverTrigger>
          <PopoverContent className="w-48 p-1.5" align="start">
            {ADMIN_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "block rounded-md px-2.5 py-1.5 text-sm transition-colors hover:bg-accent",
                  pathname === link.href ? "font-medium text-primary" : "text-foreground"
                )}
              >
                {link.label}
              </Link>
            ))}
          </PopoverContent>
        </Popover>
      )}
    </nav>
  );
}
