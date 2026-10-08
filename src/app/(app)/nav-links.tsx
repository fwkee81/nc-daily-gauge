"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

// Everything else that used to live in this dropdown (NC Metrics, Wellness
// Report) moved up into the primary row — this is just the two
// team-across-branches views now, hence the "Team" label below.
const TEAM_DROPDOWN_LINKS = [
  { href: "/branches", label: "Branches" },
  { href: "/admin/coaches", label: "Coaches" },
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
  const inTeamGroup = TEAM_DROPDOWN_LINKS.some((link) => pathname.startsWith(link.href));

  const primaryLinks = [
    { href: "/checkin", label: "Check-in" },
    { href: "/reports/daily", label: "Daily Report" },
    ...(isAdmin ? [{ href: "/admin/customers", label: "Customers" }] : []),
    { href: "/inventory", label: "Inventory" },
    { href: "/finance", label: "Finance" },
    { href: "/reports/metrics", label: "NC Metrics" },
    { href: "/loyalty", label: "Loyalty" },
    // Soft launch — only shown to the beta coach, see canSeeFriendshipPass()
    // in src/lib/auth.ts.
    ...(showFriendshipPass ? [{ href: "/friendship-pass", label: "Friendship Pass" }] : []),
    ...(isAdmin ? [{ href: "/wellness-report", label: "Wellness Report" }] : []),
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
                  className={cn(pillClass(inTeamGroup), "flex shrink-0 items-center gap-1")}
                />
              }
            >
              Team <ChevronDown className="size-3.5" />
            </PopoverTrigger>
            <PopoverContent className="w-48 p-1.5" align="start">
              {TEAM_DROPDOWN_LINKS.map((link) => (
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
