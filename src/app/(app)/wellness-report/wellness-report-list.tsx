"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export interface WellnessReportCustomerRow {
  id: string;
  name: string;
  contact: string;
  nc_level: string;
  active: boolean;
  joinedWellness: boolean;
}

export function WellnessReportList({
  customers,
  viewingBranch,
  clubName,
}: {
  customers: WellnessReportCustomerRow[];
  viewingBranch: boolean;
  clubName: string | null;
}) {
  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(false);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return customers.filter((c) => {
      if (!showInactive && !c.active) return false;
      if (!q) return true;
      return c.name.toLowerCase().includes(q) || c.contact.toLowerCase().includes(q);
    });
  }, [customers, search, showInactive]);

  return (
    <div>
      {viewingBranch && (
        <div className="mt-4 flex items-center justify-between rounded-md border bg-secondary/15 px-4 py-2 text-sm">
          <span>
            Viewing branch <strong>{clubName}</strong> — not merged with your own club.
          </span>
          <Link href="/wellness-report" className="underline underline-offset-4">
            Back to my club
          </Link>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-4">
        <Input
          className="max-w-sm"
          placeholder="Search by name or contact..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
          />
          Show inactive customers
        </label>
      </div>

      <div className="mt-4 overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>NC Level</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>My Wellness</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="font-medium">{c.name}</TableCell>
                <TableCell>{c.nc_level}</TableCell>
                <TableCell>
                  <Badge variant={c.active ? "secondary" : "destructive"}>
                    {c.active ? "Active" : "Inactive"}
                  </Badge>
                </TableCell>
                <TableCell>
                  {c.joinedWellness ? (
                    <Badge className="text-primary" variant="outline">
                      Joined
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-muted-foreground">
                      Not joined
                    </Badge>
                  )}
                </TableCell>
                <TableCell>
                  <Link
                    href={`/wellness-report/${c.id}`}
                    className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                  >
                    View report <ChevronRight className="size-4" />
                  </Link>
                </TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  No customers found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
