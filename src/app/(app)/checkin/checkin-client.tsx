"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { playChime, sayHappyBirthday } from "@/lib/chime";
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
  dob: string | null;
  consumptionBalance: number;
}

// Eligible for the free Birthday Shake if today falls in the customer's
// birthday month, or within 7 days after their exact birthday date — the
// latter covers customers whose birthday lands near month-end and who come
// in a few days into the following month.
function isBirthdayShakeEligible(dob: string | null, today: Date): boolean {
  if (!dob) return false;
  const [, monthStr, dayStr] = dob.split("-");
  const month = Number(monthStr);
  const day = Number(dayStr);
  if (today.getMonth() + 1 === month) return true;

  const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  for (const yearOffset of [-1, 0]) {
    const birthday = new Date(today.getFullYear() + yearOffset, month - 1, day);
    const windowEnd = new Date(birthday);
    windowEnd.setDate(windowEnd.getDate() + 7);
    if (todayMidnight > birthday && todayMidnight <= windowEnd) return true;
  }
  return false;
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

const CONFETTI_COLORS = [
  "#9ec835",
  "#ffbd59",
  "#ff6b6b",
  "#4dabf7",
  "#f06595",
  "#9ec835",
  "#ffbd59",
  "#4dabf7",
];

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
  const [isBirthdayShake, setIsBirthdayShake] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{
    name: string;
    balance: number;
    isBirthdayShake?: boolean;
  } | null>(null);
  const [walkinOpen, setWalkinOpen] = useState(false);

  const selected = checkinOptions.find((c) => c.key === selectedKey) ?? null;
  const birthdayShakeEligible = useMemo(
    () => isBirthdayShakeEligible(selected?.dob ?? null, new Date()),
    [selected]
  );

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
      setIsBirthdayShake(false);
      return;
    }
    // same row clicked again: 1 -> 2 -> deselect
    if (cups === 1) {
      setCups(2);
    } else {
      setSelectedKey(null);
      setCups(1);
      setIsBirthdayShake(false);
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
      selected.memberId,
      isBirthdayShake
    );
    setSubmitting(false);

    if (res.error) {
      toast.error(res.error);
      return;
    }

    playChime();
    if (res.isBirthdayShake) sayHappyBirthday(res.name!);
    setResult({ name: res.name!, balance: res.balance!, isBirthdayShake: res.isBirthdayShake });
    setSelectedKey(null);
    setCups(1);
    setIsBirthdayShake(false);
    router.refresh();
  }

  function handleWalkinDone(walkinResult: { name: string; balance: number }) {
    playChime();
    setResult(walkinResult);
    router.refresh();
  }

  return (
    <div
      className={cn(
        "grid gap-6 lg:grid-cols-[1fr_320px] lg:pb-0",
        selected ? "pb-72" : "pb-40"
      )}
    >
      <div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold">
            Check-in — {format(new Date(), "EEEE, d MMM yyyy")}
          </h1>
          {isAdmin && (
            <Button variant="outline" size="sm" className="text-base" onClick={() => setWalkinOpen(true)}>
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
                      <span className="text-base font-semibold leading-tight">{c.name}</span>
                      {c.contact && (
                        <span
                          className={cn(
                            "text-sm",
                            isSelected ? "text-primary-foreground/80" : "text-muted-foreground"
                          )}
                        >
                          ···{lastFourDigits(c.contact)}
                        </span>
                      )}
                      {c.memberId && (
                        <span
                          className={cn(
                            "text-xs",
                            isSelected ? "text-primary-foreground/80" : "text-muted-foreground"
                          )}
                        >
                          shares account
                        </span>
                      )}
                      <Badge
                        className="text-sm"
                        variant={
                          c.consumptionBalance < RENEWAL_REMINDER_THRESHOLD ? "destructive" : "secondary"
                        }
                      >
                        {c.consumptionBalance} left
                      </Badge>
                      {isSelected && (
                        <span className="text-sm font-medium">
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

      {/* Fixed to the bottom of the screen on mobile so Submit is always
          reachable without scrolling past the whole customer list — sticky
          to the top of its column on desktop instead, where it already sits
          beside (not below) the list. */}
      <div className="fixed inset-x-0 bottom-0 z-40 rounded-t-xl border-t bg-background p-4 shadow-[0_-4px_16px_rgba(0,0,0,0.12)] lg:sticky lg:top-4 lg:inset-x-auto lg:bottom-auto lg:z-auto lg:h-fit lg:rounded-md lg:border lg:shadow-none">
        <h2 className="font-semibold">Selection</h2>
        {selected ? (
          <div className="mt-3 space-y-3">
            <div>
              <p className="text-lg font-medium">{selected.name}</p>
              <p className="text-sm text-muted-foreground">
                Click their name again to switch between 1 and 2 cups.
              </p>
              <Badge className="mt-2 text-sm">
                {cups} cup{cups > 1 ? "s" : ""}
              </Badge>
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
                    <Label htmlFor={`type-${type}`} className="text-base font-normal">
                      {type}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            </div>

            {birthdayShakeEligible && (
              <div className="flex items-center gap-2">
                <Checkbox
                  id="birthday-shake"
                  checked={isBirthdayShake}
                  onCheckedChange={(checked) => setIsBirthdayShake(checked)}
                />
                <Label htmlFor="birthday-shake" className="text-base font-normal">
                  🎂 Birthday Shake
                </Label>
              </div>
            )}

            <Button className="w-full text-base" onClick={handleSubmit} disabled={submitting}>
              {submitting ? "Submitting..." : "Submit check-in"}
            </Button>
          </div>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">
            Select a customer from the list to begin a check-in.
          </p>
        )}
      </div>

      <Dialog open={!!result} onOpenChange={(open) => !open && setResult(null)}>
        <DialogContent className={cn("sm:max-w-sm", result?.isBirthdayShake && "overflow-hidden")}>
          {result?.isBirthdayShake ? (
            <>
              {CONFETTI_COLORS.map((color, i) => (
                <span
                  key={i}
                  aria-hidden
                  className="pointer-events-none absolute top-0 h-2.5 w-2.5 rounded-sm"
                  style={{
                    left: `${(i * 13 + 5) % 100}%`,
                    backgroundColor: color,
                    animation: "confetti-fall 1.8s ease-in forwards",
                    animationDelay: `${(i % 6) * 0.15}s`,
                  }}
                />
              ))}
              <DialogHeader>
                <DialogTitle className="text-center text-xl">🎉 Happy Birthday! 🎉</DialogTitle>
              </DialogHeader>
              <div className="flex flex-col items-center gap-2 py-2 text-center">
                <span
                  className="text-6xl"
                  style={{ display: "inline-block", animation: "cake-bounce 1s ease-in-out infinite" }}
                >
                  🎂
                </span>
                <p className="text-lg font-semibold">{result.name}</p>
                <p className="text-sm text-muted-foreground">
                  Enjoy your free birthday breakfast — balance not deducted!
                </p>
              </div>
              <Button className="w-full text-base" onClick={() => setResult(null)}>
                OK
              </Button>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Checked in!</DialogTitle>
              </DialogHeader>
              {result && (
                <div className="space-y-2">
                  <p className="text-lg font-semibold">{result.name}</p>
                  <p className="text-sm text-muted-foreground">
                    Consumption balance left: {result.balance}
                  </p>
                  {result.balance < RENEWAL_REMINDER_THRESHOLD && (
                    <p className="text-sm font-medium text-destructive">
                      Gentle reminder {result.name}, to renew your nutrition breakfast card.
                    </p>
                  )}
                </div>
              )}
              <Button className="w-full text-base" onClick={() => setResult(null)}>
                OK
              </Button>
            </>
          )}
        </DialogContent>
      </Dialog>

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
