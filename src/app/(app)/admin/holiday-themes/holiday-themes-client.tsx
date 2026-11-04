"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { HolidayThemeSlug } from "@/lib/holiday-themes";
import { updateHolidayTheme } from "./actions";

interface AutomaticThemeRow {
  slug: HolidayThemeSlug;
  name: string;
  emoji: string;
  dateDescription: string;
}

interface ManualThemeRow {
  slug: HolidayThemeSlug;
  name: string;
  emoji: string;
  startDate: string;
  endDate: string;
  enabled: boolean;
}

export function HolidayThemesClient({
  automaticThemes,
  manualThemes,
}: {
  automaticThemes: AutomaticThemeRow[];
  manualThemes: ManualThemeRow[];
}) {
  const [rows, setRows] = useState(manualThemes);
  const [savingSlug, setSavingSlug] = useState<string | null>(null);

  function patch(slug: string, changes: Partial<ManualThemeRow>) {
    setRows((prev) => prev.map((r) => (r.slug === slug ? { ...r, ...changes } : r)));
  }

  async function save(row: ManualThemeRow) {
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
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Holiday Themes</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          The Check-in page switches to a theme automatically on the dates below.
        </p>
      </div>

      <div className="space-y-3">
        <div>
          <h2 className="text-lg font-medium">Set by hand</h2>
          <p className="text-sm text-muted-foreground">
            Lunar/Hijri/Tamil-calendar holidays, whose real date depends on moon-sighting or an official
            gazette (no formula for those — update once the official date is announced), plus Christmas,
            since the theme is meant to start a few days early rather than exactly on the 25th.
          </p>
        </div>
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

      <div className="space-y-3">
        <div>
          <h2 className="text-lg font-medium">Automatic — nothing to do</h2>
          <p className="text-sm text-muted-foreground">
            Fixed calendar dates, computed every year. Listed here just so you can see the full picture.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {automaticThemes.map((theme) => (
            <div
              key={theme.slug}
              className="flex items-center justify-between gap-3 rounded-lg border bg-card px-4 py-3"
            >
              <div className="flex items-center gap-2 text-sm font-medium">
                <span aria-hidden>{theme.emoji}</span>
                {theme.name}
              </div>
              <span className="text-xs text-muted-foreground">{theme.dateDescription}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
