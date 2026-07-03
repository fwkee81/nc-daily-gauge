"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { playChime } from "@/lib/chime";
import { CONSUMPTION_TYPES, RENEWAL_REMINDER_THRESHOLD } from "@/lib/constants";
import type { ConsumptionType } from "@/lib/types/database";
import { submitCheckin } from "./actions";
import { WalkinDialog } from "./walkin-dialog";

interface CheckinOption {
  key: string;
  customerId: string;
  memberId: string | null;
  name: string;
  contact: string;
  consumptionBalance: number;
}

interface CustomerOption {
  id: string;
  name: string;
}

interface CoachOption {
  id: string;
  name: string;
}

function lastFourDigits(contact: string) {
  return contact.replace(/\D/g, "").slice(-4);
}

export function CheckinClient({
  checkinOptions,
  customers,
  coaches,
  isAdmin,
}: {
  checkinOptions: CheckinOption[];
  customers: CustomerOption[];
  coaches: CoachOption[];
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [cups, setCups] = useState(1);
  const [consumptionType, setConsumptionType] = useState<ConsumptionType>(CONSUMPTION_TYPES[0]);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ name: string; balance: number } | null>(null);
  const [walkinOpen, setWalkinOpen] = useState(false);

  const selected = checkinOptions.find((c) => c.key === selectedKey) ?? null;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return checkinOptions;
    return checkinOptions.filter(
      (c) => c.name.toLowerCase().includes(q) || lastFourDigits(c.contact).includes(q)
    );
  }, [checkinOptions, search]);

  const groups = useMemo(() => {
    const map = new Map<string, CheckinOption[]>();
    for (const c of filtered) {
      const letter = c.name.trim()[0]?.toUpperCase() ?? "#";
      if (!map.has(letter)) map.set(letter, []);
      map.get(letter)!.push(c);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  function handleSelect(key: string) {
    setResult(null);
    if (selectedKey !== key) {
      setSelectedKey(key);
      setCups(1);
      return;
    }
    // same row clicked again: 1 -> 2 -> deselect
    if (cups === 1) {
      setCups(2);
    } else {
      setSelectedKey(null);
      setCups(1);
    }
  }

  async function handleSubmit() {
    if (!selected) return;
    setSubmitting(true);
    const checkinDate = format(new Date(), "yyyy-MM-dd");
    const res = await submitCheckin(
      selected.customerId,
      cups,
      consumptionType,
      checkinDate,
      selected.memberId
    );
    setSubmitting(false);

    if (res.error) {
      toast.error(res.error);
      return;
    }

    playChime();
    setResult({ name: res.name!, balance: res.balance! });
    setSelectedKey(null);
    setCups(1);
    router.refresh();
  }

  function handleWalkinDone(walkinResult: { name: string; balance: number }) {
    playChime();
    setResult(walkinResult);
    router.refresh();
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold">
            Check-in — {format(new Date(), "EEEE, d MMM yyyy")}
          </h1>
          {isAdmin && (
            <Button variant="outline" size="sm" onClick={() => setWalkinOpen(true)}>
              Walk-in (Ala Carte)
            </Button>
          )}
        </div>
        <Input
          className="mt-4"
          placeholder="Search by name or last 4 digits of contact..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        <div className="mt-4 space-y-3">
          {groups.map(([letter, items]) => (
            <details key={letter} open className="rounded-md border">
              <summary className="cursor-pointer select-none bg-muted/50 px-3 py-2 text-sm font-semibold">
                {letter} <span className="text-muted-foreground">({items.length})</span>
              </summary>
              <div className="grid grid-cols-2 gap-2 p-2 sm:grid-cols-3 md:grid-cols-5">
                {items.map((c) => {
                  const isSelected = selectedKey === c.key;
                  return (
                    <button
                      key={c.key}
                      type="button"
                      onClick={() => handleSelect(c.key)}
                      className={cn(
                        "flex flex-col items-center justify-center gap-1 rounded-xl border px-2 py-3 text-center transition-colors",
                        isSelected
                          ? "border-primary bg-primary text-primary-foreground"
                          : "hover:bg-accent"
                      )}
                    >
                      <span className="text-sm font-semibold leading-tight">{c.name}</span>
                      {c.contact && (
                        <span
                          className={cn(
                            "text-xs",
                            isSelected ? "text-primary-foreground/80" : "text-muted-foreground"
                          )}
                        >
                          ···{lastFourDigits(c.contact)}
                        </span>
                      )}
                      {c.memberId && (
                        <span
                          className={cn(
                            "text-[10px]",
                            isSelected ? "text-primary-foreground/80" : "text-muted-foreground"
                          )}
                        >
                          shares account
                        </span>
                      )}
                      <Badge
                        variant={
                          c.consumptionBalance < RENEWAL_REMINDER_THRESHOLD ? "destructive" : "secondary"
                        }
                      >
                        {c.consumptionBalance} left
                      </Badge>
                      {isSelected && (
                        <span className="text-xs font-medium">
                          {cups} cup{cups > 1 ? "s" : ""}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </details>
          ))}
          {groups.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">No customers found.</p>
          )}
        </div>
      </div>

      <div className="space-y-4">
        <div className="rounded-md border p-4">
          <h2 className="font-semibold">Selection</h2>
          {selected ? (
            <div className="mt-3 space-y-3">
              <div>
                <p className="font-medium">{selected.name}</p>
                <p className="text-sm text-muted-foreground">
                  Click their name again to switch between 1 and 2 cups.
                </p>
                <Badge className="mt-2">{cups} cup{cups > 1 ? "s" : ""}</Badge>
              </div>

              <div>
                <Label className="mb-2 block">Consumption type</Label>
                <RadioGroup
                  value={consumptionType}
                  onValueChange={(v) => setConsumptionType(v as ConsumptionType)}
                >
                  {CONSUMPTION_TYPES.map((type) => (
                    <div key={type} className="flex items-center gap-2">
                      <RadioGroupItem value={type} id={`type-${type}`} />
                      <Label htmlFor={`type-${type}`} className="font-normal">
                        {type}
                      </Label>
                    </div>
                  ))}
                </RadioGroup>
              </div>

              <Button className="w-full" onClick={handleSubmit} disabled={submitting}>
                {submitting ? "Submitting..." : "Submit check-in"}
              </Button>
            </div>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">
              Select a customer from the list to begin a check-in.
            </p>
          )}
        </div>

        {result && (
          <div className="rounded-md border bg-accent/40 p-4">
            <p className="font-semibold">{result.name}</p>
            <p className="text-sm">Consumption balance left: {result.balance}</p>
            {result.balance < RENEWAL_REMINDER_THRESHOLD && (
              <p className="mt-2 text-sm font-medium text-destructive">
                Remind customer to renew their NC card.
              </p>
            )}
          </div>
        )}
      </div>

      {isAdmin && (
        <WalkinDialog
          open={walkinOpen}
          onOpenChange={setWalkinOpen}
          coaches={coaches}
          customers={customers}
          onDone={handleWalkinDone}
        />
      )}
    </div>
  );
}
