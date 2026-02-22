"use client";

import { PanelRightClose } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import TicketPanel from "@/components/tickets/TicketPanel";
import MeetingsPanel from "@/components/meetings/MeetingsPanel";
import GuidePanel from "@/components/guide/GuidePanel";
import ActivityPanel from "@/components/activity/ActivityPanel";
import { useRoomStore } from "@/lib/store";
import { Button } from "@/components/ui/button";

export default function RightPanel({
  className,
  onClose
}: {
  className?: string;
  onClose?: () => void;
}) {
  const { panelTab, setPanelTab } = useRoomStore();

  return (
    <aside className={`h-full w-[360px] flex-col border-l border-border/70 bg-background/95 p-4 ${className ?? "hidden lg:flex"}`}>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-semibold">Workspace Panel</p>
        {onClose ? (
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close panel">
            <PanelRightClose className="h-4 w-4" />
          </Button>
        ) : null}
      </div>
      <Tabs value={panelTab} onValueChange={(value) => setPanelTab(value as any)} className="flex min-h-0 flex-1 flex-col">
        <TabsList className="grid w-full grid-cols-2 gap-1 lg:grid-cols-4">
          <TabsTrigger value="tickets">Tickets</TabsTrigger>
          <TabsTrigger value="meetings">Meetings</TabsTrigger>
          <TabsTrigger value="guide">Guide</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
        </TabsList>
        <TabsContent value="tickets" className="no-scrollbar mt-4 min-h-0 flex-1 overflow-y-auto pr-1">
          <TicketPanel />
        </TabsContent>
        <TabsContent value="meetings" className="no-scrollbar mt-4 min-h-0 flex-1 overflow-y-auto pr-1">
          <MeetingsPanel />
        </TabsContent>
        <TabsContent value="guide" className="no-scrollbar mt-4 min-h-0 flex-1 overflow-y-auto pr-1">
          <GuidePanel />
        </TabsContent>
        <TabsContent value="activity" className="no-scrollbar mt-4 min-h-0 flex-1 overflow-y-auto pr-1">
          <ActivityPanel />
        </TabsContent>
      </Tabs>
    </aside>
  );
}
