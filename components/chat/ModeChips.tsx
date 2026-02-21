"use client";

import { Brain, ClipboardList, Handshake, Lightbulb, CalendarRange } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { Mode } from "@/lib/types";

type ModeChipsProps = {
  mode: Mode;
  onChange: (mode: Mode, label: string) => void;
};

const modes = [
  { mode: "brainstorm" as Mode, label: "Brainstorm", icon: Lightbulb },
  { mode: "planning" as Mode, label: "Generate tickets", icon: ClipboardList },
  { mode: "conflict" as Mode, label: "Conflict help", icon: Handshake },
  { mode: "general" as Mode, label: "Clarify requirements", icon: Brain },
  { mode: "general" as Mode, label: "Schedule meeting", icon: CalendarRange }
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
