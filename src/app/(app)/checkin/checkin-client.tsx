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

interface CustomerOption {
  id: string;
  name: string;
  contact: string;
  dob: string;
  consumption_balance: number;
}

function lastFourDigits(contact: string) {
  return contact.replace(/\D/g, "").slice(-4);
}

export function CheckinClient({ customers }: { customers: CustomerOption[] }) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [cups, setCups] = useState(1);
  const [consumptionType, setConsumptionType] = useState<ConsumptionType>(CONSUMPTION_TYPES[0]);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ name: string; balance: number } | null>(null);

  const selected = customers.find((c) => c.id === selectedId) ?? null;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter(
      (c) => c.name.toLowerCase().includes(q) || lastFourDigits(c.contact).includes(q)
    );
  }, [customers, search]);

  const groups = useMemo(() => {
    const map = new Map<string, CustomerOption[]>();
    for (const c of filtered) {
      const letter = c.name.trim()[0]?.toUpperCase() ?? "#";
      if (!map.has(letter)) map.set(letter, []);
      map.get(letter)!.push(c);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  function handleSelect(id: string) {
    setResult(null);
    if (selectedId !== id) {
      setSelectedId(id);
      setCups(1);
      return;
    }
    // same customer clicked again: 1 -> 2 -> deselect
    if (cups === 1) {
      setCups(2);
    } else {
      setSelectedId(null);
      setCups(1);
    }
  }

  async function handleSubmit() {
    if (!selected) return;
    setSubmitting(true);
    const checkinDate = format(new Date(), "yyyy-MM-dd");
    const res = await submitCheckin(selected.id, cups, consumptionType, checkinDate);
    setSubmitting(false);

    if (res.error) {
      toast.error(res.error);
      return;
    }

    playChime();
    setResult({ name: res.name!, balance: res.balance! });
    setSelectedId(null);
    setCups(1);
    router.refresh();
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div>
        <h1 className="text-2xl font-semibold">Check-in</h1>
        <Input
          className="mt-4"
          placeholder="Search by name or last 4 digits of contact..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        <div className="mt-4 space-y-3">
          {groups.map(([letter, members]) => (
            <details key={letter} open className="rounded-md border">
              <summary className="cursor-pointer select-none bg-muted/50 px-3 py-2 text-sm font-semibold">
                {letter} <span className="text-muted-foreground">({members.length})</span>
              </summary>
              <ul className="divide-y">
                {members.map((c) => {
                  const isSelected = selectedId === c.id;
                  return (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => handleSelect(c.id)}
                        className={cn(
                          "flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-accent",
                          isSelected && "bg-accent"
                        )}
                      >
                        <span>
                          {c.name}{" "}
                          <span className="text-xs text-muted-foreground">
                            ···{lastFourDigits(c.contact)}
                          </span>
                        </span>
                        <span className="flex items-center gap-2">
                          {isSelected && <Badge>{cups} cup{cups > 1 ? "s" : ""}</Badge>}
                          <Badge
                            variant={
                              c.consumption_balance < RENEWAL_REMINDER_THRESHOLD ? "destructive" : "secondary"
                            }
                          >
                            {c.consumption_balance} left
                          </Badge>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
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
    </div>
  );
}
