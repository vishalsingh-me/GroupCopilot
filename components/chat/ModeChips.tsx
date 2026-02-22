"use client";

import { Brain, ClipboardList, Handshake, Lightbulb, CalendarRange } from "lucide-react";
import type { ComponentType } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { Mode } from "@/lib/types";

type ModeChipsProps = {
  mode: Mode;
  onChange: (mode: Mode, label: string) => void;
};

const modes: Array<{ mode: Mode; label: string; icon: ComponentType<{ className?: string }> }> = [
  { mode: "brainstorm", label: "Brainstorm", icon: Lightbulb },
  { mode: "clarify", label: "Clarify", icon: Brain },
  { mode: "tickets", label: "Tickets", icon: ClipboardList },
  { mode: "schedule", label: "Schedule", icon: CalendarRange },
  { mode: "conflict", label: "Conflict", icon: Handshake }
];

export default function ModeChips({ mode, onChange }: ModeChipsProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge variant="outline">Mode: {mode}</Badge>
      {modes.map((item) => {
        const Icon = item.icon;
        return (
          <Button
            key={item.label}
            variant={mode === item.mode ? "secondary" : "outline"}
            size="sm"
            onClick={() => onChange(item.mode, item.label)}
          >
            <Icon className="h-4 w-4" />
            {item.label}
          </Button>
        );
      })}
    </div>
  );
}
