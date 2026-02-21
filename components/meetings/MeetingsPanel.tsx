"use client";

import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import MeetingCard from "@/components/meetings/MeetingCard";
import SlotPicker from "@/components/meetings/SlotPicker";
import ToolConfirmDialog from "@/components/integrations/ToolConfirmDialog";
import { useRoomStore, createSystemMessage } from "@/lib/store";
import { seedMeetingSlots } from "@/lib/mock";
import { useToast } from "@/components/common/use-toast";

export default function MeetingsPanel() {
  const { meetingSlots, setMeetingSlots, settings, addToolAction, updateToolAction, addMessage } = useRoomStore();
  const { toast } = useToast();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const suggest = () => {
    setMeetingSlots(seedMeetingSlots());
  };

  const mutation = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/tools/calendar/create-event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slots: meetingSlots })
      });
      if (!response.ok) {
        throw new Error("Failed to create meeting");
      }
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Meeting created", description: "Mocked Google Calendar event created." });
      addMessage(createSystemMessage("Tool result: Calendar event created.", "general"));
    },
    onError: () => {
      toast({ title: "Tool call failed", description: "Retry when ready." });
    }
  });

  const handleCreate = () => {
    const action = {
      id: Math.random().toString(36).slice(2, 9),
      tool: "calendar" as const,
      status: "pending" as const,
      summary: "Create meeting in Google Calendar",
      createdAt: new Date().toISOString()
    };
    addToolAction(action);
    mutation.mutate(undefined, {
      onSuccess: () => updateToolAction({ ...action, status: "success" }),
      onError: () => updateToolAction({ ...action, status: "error" })
    });
  };

  const slots = useMemo(() => meetingSlots, [meetingSlots]);

  return (
    <div className="flex flex-col gap-4">
      <SlotPicker onSuggest={suggest} />
      <div className="rounded-2xl border border-border bg-muted/40 p-4">
        <h3 className="text-sm font-semibold">Connect Google Calendar</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          OAuth will be enabled after MCP integration. For now, this is a UI stub.
        </p>
        <Button className="mt-3" variant="outline" disabled>
          Connect (coming soon)
        </Button>
      </div>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Proposed slots</h3>
        <Button
          size="sm"
          variant="secondary"
          disabled={slots.length === 0}
          onClick={() => (settings.requireToolConfirmation ? setConfirmOpen(true) : handleCreate())}
        >
          Create in Google Calendar
        </Button>
      </div>
      <div className="flex flex-col gap-3">
        {slots.length === 0 ? (
          <p className="text-sm text-muted-foreground">Generate slots to see options.</p>
        ) : (
          slots.map((slot) => <MeetingCard key={slot.id} slot={slot} />)
        )}
      </div>
      <ToolConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => {
          setConfirmOpen(false);
          handleCreate();
        }}
        title="Create calendar event?"
        description="This will send the suggested time slots to the MCP calendar tool."
      />
    </div>
  );
}
