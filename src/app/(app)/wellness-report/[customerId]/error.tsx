"use client";

import { useEffect } from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

// This page renders a customer's My Wellness data — an external system this
// app only reads from, with no guarantee every field is clean. Individual
// bad values are guarded against in page.tsx as they're found, but this
// route-level boundary is the backstop: one still-unknown bad field
// shouldn't lock a coach out of every other customer's Wellness Report.
export default function WellnessReportDetailError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    console.error("Wellness Report detail failed to render:", error);
  }, [error]);

  return (
    <div className="space-y-3">
      <Link
        href="/wellness-report"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" /> Back to Wellness Report
      </Link>
      <div className="rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
        Couldn&apos;t load this customer&apos;s Wellness Report — their My Wellness data has an
        unexpected value this page doesn&apos;t know how to show yet.
      </div>
    </div>
  );
}
