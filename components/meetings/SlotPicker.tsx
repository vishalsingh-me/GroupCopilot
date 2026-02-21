"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type SlotPickerProps = {
  onSuggest: () => void;
};

export default function SlotPicker({ onSuggest }: SlotPickerProps) {
  const [duration, setDuration] = useState("30");
  const [range, setRange] = useState("Next 7 days");
  const [hours, setHours] = useState("9am - 6pm");

  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-soft">
      <h3 className="text-sm font-semibold">Suggest meeting times</h3>
      <div className="mt-3 grid gap-2">
        <label className="text-xs font-medium">Duration (minutes)</label>
        <Input value={duration} onChange={(event) => setDuration(event.target.value)} />
        <label className="text-xs font-medium">Date range</label>
        <Input value={range} onChange={(event) => setRange(event.target.value)} />
        <label className="text-xs font-medium">Preferred hours</label>
        <Input value={hours} onChange={(event) => setHours(event.target.value)} />
      </div>
      <Button className="mt-4 w-full" onClick={onSuggest}>
        Generate slots
      </Button>
    </div>
  );
}
