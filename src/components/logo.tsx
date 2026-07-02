import { Coffee } from "lucide-react";
import { cn } from "@/lib/utils";

export function Logo({ className, iconOnly }: { className?: string; iconOnly?: boolean }) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <span
        className="flex size-8 shrink-0 items-center justify-center rounded-xl text-white shadow-sm"
        style={{ background: "linear-gradient(135deg, var(--brand-green), var(--brand-orange))" }}
      >
        <Coffee className="size-4.5" strokeWidth={2.25} />
      </span>
      {!iconOnly && (
        <span className="font-heading text-lg font-semibold tracking-tight">NC Daily Gauge</span>
      )}
    </div>
  );
}
