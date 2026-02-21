"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

type ComposerProps = {
  onSend: (value: string) => void;
  disabled?: boolean;
};

const presets = [
  "Help us pick a project idea",
  "Ask us questions to clarify requirements",
  "Turn our plan into tickets",
  "Schedule a meeting",
  "We have a conflict, help us resolve it"
];

export default function Composer({ onSend, disabled }: ComposerProps) {
  const [value, setValue] = useState("");

  const submit = () => {
    if (!value.trim()) return;
    onSend(value.trim());
    setValue("");
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-soft">
      <div className="flex flex-wrap gap-2 pb-3">
        {presets.map((preset) => (
          <Button
            key={preset}
            variant="outline"
            size="sm"
            onClick={() => onSend(preset)}
          >
            {preset}
          </Button>
        ))}
      </div>
      <Textarea
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder="Start by telling the assistant your goal..."
        className="min-h-[120px] resize-none"
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            submit();
          }
        }}
      />
      <div className="mt-3 flex items-center justify-between">
        <p className="text-xs text-muted-foreground">Press Enter to send, Shift+Enter for newline.</p>
        <Button onClick={submit} disabled={disabled || !value.trim()}>
          Send
        </Button>
      </div>
    </div>
  );
}
