"use client";

import { Menu, PanelRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import ThemeToggle from "@/components/layout/ThemeToggle";
import { useRoomStore } from "@/lib/store";

type TopbarProps = {
  onOpenSidebar?: () => void;
  onOpenPanel?: () => void;
};

export default function Topbar({ onOpenSidebar, onOpenPanel }: TopbarProps) {
  const { room } = useRoomStore();

  return (
    <header className="flex items-center justify-between border-b border-border bg-card/70 px-4 py-3 backdrop-blur lg:px-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" className="lg:hidden" onClick={onOpenSidebar}>
          <Menu className="h-5 w-5" />
        </Button>
        <div>
          <p className="text-xs uppercase text-muted-foreground">Group Copilot</p>
          <p className="text-base font-semibold">{room?.name ?? "Workspace"}</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="icon" className="lg:hidden" onClick={onOpenPanel}>
          <PanelRight className="h-4 w-4" />
        </Button>
        <ThemeToggle />
      </div>
    </header>
  );
}
