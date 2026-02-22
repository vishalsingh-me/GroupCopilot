"use client";

import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import MeetingCard from "@/components/meetings/MeetingCard";
import ToolConfirmDialog from "@/components/integrations/ToolConfirmDialog";
import { useRoomStore } from "@/lib/store";
import { seedMeetingSlots } from "@/lib/mock";
import { useToast } from "@/components/common/use-toast";

export default function MeetingsPanel() {
  const { meetingSlots, setMeetingSlots, settings, room } = useRoomStore();
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
        body: JSON.stringify({ roomCode: room?.code, event: meetingSlots[0] })
      });
      if (!response.ok) {
        throw new Error("Failed to create meeting");
      }
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Meeting created", description: "Calendar event request sent (mocked if tools off)." });
    },
    onError: () => {
      toast({ title: "Tool call failed", description: "Retry when ready." });
    }
  });

  const handleCreate = () => {
    mutation.mutate();
  };

  const slots = useMemo(() => meetingSlots, [meetingSlots]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Meeting proposals</h3>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={suggest}>
            Suggest
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={slots.length === 0}
            onClick={() => (settings.requireToolConfirmation ? setConfirmOpen(true) : handleCreate())}
          >
            Create event
          </Button>
        </div>
      </div>
      <div className="flex flex-col gap-3">
        {slots.length === 0 ? (
          <p className="text-sm text-muted-foreground">Ask the assistant in schedule mode or click Suggest.</p>
        ) : (
          slots.map((slot, idx) => <MeetingCard key={slot.id ?? idx} slot={slot} />)
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
        description="This will send the suggested time to the calendar MCP tool."
      />
    </div>
  );
}
