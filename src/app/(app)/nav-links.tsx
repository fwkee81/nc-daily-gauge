"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

// Customers is admin-only, so it's a primary pill for admins (who also get
// the Admin dropdown for everything else) but NC Metrics — open to every
// coach — has to stay in the primary row for non-admins, since they never
// see the dropdown at all.
const ADMIN_DROPDOWN_LINKS = [
  { href: "/reports/metrics", label: "NC Metrics" },
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
  const inAdminGroup = ADMIN_DROPDOWN_LINKS.some((link) => pathname.startsWith(link.href));

  const primaryLinks = [
    { href: "/checkin", label: "Check-in" },
    { href: "/reports/daily", label: "Daily Report" },
    ...(isAdmin
      ? [{ href: "/admin/customers", label: "Customers" }]
      : [{ href: "/reports/metrics", label: "NC Metrics" }]),
  ];

  return (
    <nav className="flex flex-wrap items-center gap-1">
      {primaryLinks.map((link) => (
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
            {ADMIN_DROPDOWN_LINKS.map((link) => (
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
