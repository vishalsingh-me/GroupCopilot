"use client";

import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import TicketPanel from "@/components/tickets/TicketPanel";
import MeetingsPanel from "@/components/meetings/MeetingsPanel";
import GuidePanel from "@/components/guide/GuidePanel";
import { useRoomStore } from "@/lib/store";

export default function RightPanel({ className }: { className?: string }) {
  const { panelTab, setPanelTab } = useRoomStore();

  return (
    <aside className={`h-full w-96 flex-col border-l border-border bg-card/70 p-4 ${className ?? "hidden lg:flex"}`}>
      <Tabs value={panelTab} onValueChange={(value) => setPanelTab(value as "tickets" | "meetings" | "guide")}>
        <TabsList className="w-full justify-between">
          <TabsTrigger value="tickets">Tickets</TabsTrigger>
          <TabsTrigger value="meetings">Meetings</TabsTrigger>
          <TabsTrigger value="guide">Guide</TabsTrigger>
        </TabsList>
        <TabsContent value="tickets">
          <TicketPanel />
        </TabsContent>
        <TabsContent value="meetings">
          <MeetingsPanel />
        </TabsContent>
        <TabsContent value="guide">
          <GuidePanel />
        </TabsContent>
      </Tabs>
    </aside>
  );
}
