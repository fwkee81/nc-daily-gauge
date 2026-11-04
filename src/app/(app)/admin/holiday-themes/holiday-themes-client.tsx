"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { HolidayThemeSlug } from "@/lib/holiday-themes";
import { updateHolidayTheme } from "./actions";

interface ThemeRow {
  slug: HolidayThemeSlug;
  name: string;
  emoji: string;
  startDate: string;
  endDate: string;
  enabled: boolean;
}

export function HolidayThemesClient({ themes }: { themes: ThemeRow[] }) {
  const [rows, setRows] = useState(themes);
  const [savingSlug, setSavingSlug] = useState<string | null>(null);

  function patch(slug: string, changes: Partial<ThemeRow>) {
    setRows((prev) => prev.map((r) => (r.slug === slug ? { ...r, ...changes } : r)));
  }

  async function save(row: ThemeRow) {
    if (!row.startDate || !row.endDate) {
      toast.error("Set both a start and end date first.");
      return;
    }
    setSavingSlug(row.slug);
    const result = await updateHolidayTheme(row.slug, {
      startDate: row.startDate,
      endDate: row.endDate,
      enabled: row.enabled,
    });
    setSavingSlug(null);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success(`${row.name} updated.`);
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Holiday Themes</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          The Check-in page switches to a theme automatically on the dates below. Several lunar/floating
          holidays (Chinese New Year, Deepavali) move every year, so these need a yearly update.
        </p>
      </div>

      <div className="space-y-3">
        {rows.map((row) => (
          <div key={row.slug} className="rounded-lg border bg-card p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-base font-medium">
                <span aria-hidden>{row.emoji}</span>
                {row.name}
              </div>
              <div className="flex items-center gap-2">
                <Label htmlFor={`enabled-${row.slug}`} className="text-sm text-muted-foreground">
                  Enabled
                </Label>
                <Switch
                  id={`enabled-${row.slug}`}
                  checked={row.enabled}
                  onCheckedChange={(checked) => patch(row.slug, { enabled: checked })}
                />
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-end gap-3">
              <div>
                <Label htmlFor={`start-${row.slug}`} className="text-xs text-muted-foreground">
                  Start date
                </Label>
                <Input
                  id={`start-${row.slug}`}
                  type="date"
                  className="mt-1"
                  value={row.startDate}
                  onChange={(e) => patch(row.slug, { startDate: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor={`end-${row.slug}`} className="text-xs text-muted-foreground">
                  End date
                </Label>
                <Input
                  id={`end-${row.slug}`}
                  type="date"
                  className="mt-1"
                  value={row.endDate}
                  onChange={(e) => patch(row.slug, { endDate: e.target.value })}
                />
              </div>
              <Button size="sm" onClick={() => save(row)} disabled={savingSlug === row.slug}>
                {savingSlug === row.slug ? "Saving..." : "Save"}
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
