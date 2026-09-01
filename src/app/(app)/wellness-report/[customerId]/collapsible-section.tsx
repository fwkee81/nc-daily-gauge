"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function CollapsibleSection({
  title,
  icon,
  defaultOpen = true,
  children,
}: {
  title: string;
  // A pre-rendered element, not a component reference — a Server Component
  // (page.tsx) can't pass a raw component/function as a prop to a Client
  // Component like this one; only serializable JSX survives that boundary.
  icon: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <Card>
      <button type="button" className="w-full text-left" onClick={() => setOpen((v) => !v)}>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="flex items-center gap-2 text-base">
            {icon}
            {title}
          </CardTitle>
          {open ? (
            <ChevronDown className="size-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="size-4 text-muted-foreground" />
          )}
        </CardHeader>
      </button>
      {open && (
        <CardContent className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">{children}</CardContent>
      )}
    </Card>
  );
}
