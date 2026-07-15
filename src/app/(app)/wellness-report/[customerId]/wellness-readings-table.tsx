"use client";

import { useState } from "react";
import { format } from "date-fns";
import { ChevronDown, ChevronRight } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { WellnessLog } from "@/lib/types/database";

export function WellnessReadingsTable({ readings }: { readings: WellnessLog[] }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div>
      <button
        type="button"
        className="flex items-center gap-1 text-lg font-semibold"
        onClick={() => setExpanded((v) => !v)}
      >
        {expanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
        All readings ({readings.length})
      </button>
      {expanded && (
        <div className="mt-2 overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Weight</TableHead>
                <TableHead>Fat %</TableHead>
                <TableHead>Water %</TableHead>
                <TableHead>Muscle</TableHead>
                <TableHead>PR</TableHead>
                <TableHead>BMR</TableHead>
                <TableHead>Age</TableHead>
                <TableHead>Bone</TableHead>
                <TableHead>Visceral fat</TableHead>
                <TableHead>Notes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {readings.map((log) => (
                <TableRow key={log.id}>
                  <TableCell>{format(new Date(log.log_date), "d MMM yyyy")}</TableCell>
                  <TableCell>{log.weight_kg != null ? `${log.weight_kg} kg` : "—"}</TableCell>
                  <TableCell>{log.body_fat_pct != null ? `${log.body_fat_pct}%` : "—"}</TableCell>
                  <TableCell>{log.body_water_pct != null ? `${log.body_water_pct}%` : "—"}</TableCell>
                  <TableCell>{log.muscle_mass_kg != null ? `${log.muscle_mass_kg} kg` : "—"}</TableCell>
                  <TableCell>{log.physical_rating ?? "—"}</TableCell>
                  <TableCell>{log.metabolic_rate ?? "—"}</TableCell>
                  <TableCell>{log.metabolic_age ?? "—"}</TableCell>
                  <TableCell>{log.bone_mass_kg != null ? `${log.bone_mass_kg} kg` : "—"}</TableCell>
                  <TableCell>{log.visceral_fat ?? "—"}</TableCell>
                  <TableCell className="max-w-[200px] truncate">{log.notes || "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
