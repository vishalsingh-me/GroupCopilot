"use client";

import { Menu, PanelRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import ThemeToggle from "@/components/layout/ThemeToggle";
import { useRoomStore } from "@/lib/store";
import UserMenu from "@/components/user-menu";

type TopbarProps = {
  onOpenSidebar?: () => void;
  onTogglePanel?: () => void;
  onOpenMobilePanel?: () => void;
  panelOpen?: boolean;
};

export default function Topbar({
  onOpenSidebar,
  onTogglePanel,
  onOpenMobilePanel,
  panelOpen
}: TopbarProps) {
  const { room } = useRoomStore();

  return (
    <header className="flex items-center justify-between border-b border-border/70 bg-background/95 px-4 py-3 backdrop-blur lg:px-6">
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
        <Button
          variant={panelOpen ? "secondary" : "outline"}
          size="sm"
          className="hidden lg:inline-flex"
          onClick={onTogglePanel}
        >
          <PanelRight className="h-4 w-4" />
          Panel
        </Button>
        <UserMenu />
        <Button variant="outline" size="icon" className="lg:hidden" onClick={onOpenMobilePanel}>
          <PanelRight className="h-4 w-4" />
        </Button>
        <ThemeToggle />
      </div>
    </header>
  );
}
