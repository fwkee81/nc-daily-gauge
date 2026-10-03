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
    "rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
    active
      ? "bg-primary text-primary-foreground"
      : "text-foreground/70 hover:bg-card hover:text-foreground"
  );
}

export function NavLinks({
  isAdmin,
  showFriendshipPass,
}: {
  isAdmin: boolean;
  showFriendshipPass?: boolean;
}) {
  const pathname = usePathname();
  const inAdminGroup = ADMIN_DROPDOWN_LINKS.some((link) => pathname.startsWith(link.href));

  const primaryLinks = [
    { href: "/checkin", label: "Check-in" },
    { href: "/reports/daily", label: "Daily Report" },
    { href: "/inventory", label: "Inventory" },
    ...(isAdmin
      ? [{ href: "/admin/customers", label: "Customers" }]
      : [{ href: "/reports/metrics", label: "NC Metrics" }]),
    { href: "/finance", label: "Finance" },
    { href: "/loyalty", label: "Loyalty" },
    // Soft launch — only shown to the beta coach, see canSeeFriendshipPass()
    // in src/lib/auth.ts.
    ...(showFriendshipPass ? [{ href: "/friendship-pass", label: "Friendship Pass" }] : []),
  ];

  return (
    // Scrolls horizontally instead of wrapping to multiple lines — on a
    // phone this keeps the nav to one compact row no matter how many links
    // get added, instead of pills wrapping down and pushing page content
    // lower each time a new feature lands. Lives in its own full-width row
    // (see layout.tsx) so it has a stable width to scroll within.
    //
    // The amber "rail" background sets the whole strip apart from the page
    // behind it, so it reads as one scrollable control rather than loose
    // text; the fade on the right hints there's more to scroll to.
    <div className="relative">
      <nav className="scrollbar-hide flex items-center gap-1 overflow-x-auto rounded-full bg-secondary/15 p-1">
        {primaryLinks.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={cn(pillClass(pathname === link.href), "shrink-0")}
          >
            {link.label}
          </Link>
        ))}

        {isAdmin && (
          <Popover>
            <PopoverTrigger
              render={
                <button
                  type="button"
                  className={cn(pillClass(inAdminGroup), "flex shrink-0 items-center gap-1")}
                />
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
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 right-0 w-8 rounded-r-full bg-gradient-to-l from-secondary/25 to-transparent"
      />
    </div>
  );
}
