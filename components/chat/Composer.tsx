"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

type ComposerProps = {
  onSend: (value: string) => void;
  disabled?: boolean;
  showPresets?: boolean;
};

const presets = [
  "Hi, can you help us plan this week?",
  "We're behind schedule. What should we do next?",
  "Can you review our plan and flag the biggest risks?",
  "We disagree on priorities. Help us mediate neutrally.",
  "Suggest a concise action plan for the next 3 days."
];

export default function Composer({ onSend, disabled, showPresets = false }: ComposerProps) {
  const [value, setValue] = useState("");
  const [showQuickPrompts, setShowQuickPrompts] = useState(false);

  const submit = () => {
    if (!value.trim()) return;
    onSend(value.trim());
    setValue("");
  };

  return (
    <div className="sticky bottom-0 z-20 border-t border-border/60 bg-background/90 pb-4 pt-3 backdrop-blur">
      {showPresets ? (
        <div className="mb-3 flex items-center justify-between">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowQuickPrompts((prev) => !prev)}
            className="text-xs text-muted-foreground"
          >
            <Sparkles className="h-3.5 w-3.5" />
            {showQuickPrompts ? "Hide quick prompts" : "Show quick prompts"}
          </Button>
        </div>
      ) : null}
      {showPresets && showQuickPrompts ? (
        <div className="mb-3 flex flex-wrap gap-2">
          {presets.map((preset) => (
            <Button
              key={preset}
              variant="outline"
              size="sm"
              disabled={disabled}
              onClick={() => onSend(preset)}
            >
              {preset}
            </Button>
          ))}
        </div>
      ) : null}
      <div className="rounded-2xl border border-border bg-card p-3 shadow-soft">
        <Textarea
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="Message Group Copilot..."
          className="min-h-[92px] resize-none border-0 px-0 font-chatSerif text-[16px] leading-7 tracking-normal shadow-none focus-visible:ring-0 sm:text-[17px]"
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              submit();
            }
          }}
        />
        <div className="mt-2 flex items-center justify-between">
          <p className="text-xs text-muted-foreground">Enter to send, Shift+Enter newline.</p>
          <Button onClick={submit} disabled={disabled || !value.trim()}>
            {disabled ? "Sending..." : "Send"}
          </Button>
        </div>
      </div>
    </div>
  );
}
