"use client";

import { useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useRoomStore } from "@/lib/store";
import type { Ticket } from "@/lib/types";
import { useToast } from "@/components/common/use-toast";

export default function TicketPanel() {
  const { room, tickets, setTickets, updateTicket, settings } = useRoomStore();
  const { toast } = useToast();
  const code = room?.code;

  useQuery({
    queryKey: ["tickets", code],
    queryFn: async () => {
      const res = await fetch(`/api/rooms/${code}/tickets`);
      if (!res.ok) throw new Error("Failed to load tickets");
      const data = await res.json();
      setTickets(data.tickets);
      return data.tickets as Ticket[];
    },
    enabled: Boolean(code)
  });

  const updateMutation = useMutation({
    mutationFn: async (payload: { id: string; status: Ticket["status"] }) => {
      const res = await fetch(`/api/tickets/${payload.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: payload.status })
      });
      if (!res.ok) throw new Error("Update failed");
      return res.json() as Promise<{ ticket: Ticket }>;
    },
    onSuccess: ({ ticket }) => {
      updateTicket(ticket);
    },
    onError: () => toast({ title: "Could not update ticket" })
  });

  const notionMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/tools/notion/create-task", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomCode: code, tickets })
      });
      if (!res.ok) throw new Error("Tool call failed");
      return res.json();
    },
    onSuccess: () => toast({ title: "Notion task created (mocked if tools not configured)" }),
    onError: () => toast({ title: "Tool call failed" })
  });

  useEffect(() => {
    if (!code) return;
  }, [code]);

  if (!code) {
    return <p className="text-sm text-muted-foreground">Join a room to see tickets.</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Tickets</h2>
        <Button
          size="sm"
          variant="outline"
          disabled={tickets.length === 0}
          onClick={() => notionMutation.mutate()}
        >
          Create in Notion
        </Button>
      </div>
      {tickets.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Ask the assistant in Tickets mode to propose tasks, then accept them.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {tickets.map((ticket) => (
            <div key={ticket.id} className="rounded-xl border border-border p-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold">{ticket.title}</p>
                  <p className="text-xs text-muted-foreground">{ticket.description}</p>
                </div>
                <Select
                  defaultValue={ticket.status}
                  onValueChange={(status) => updateMutation.mutate({ id: ticket.id, status: status as Ticket["status"] })}
                >
                  <SelectTrigger className="w-28">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todo">Todo</SelectItem>
                    <SelectItem value="doing">Doing</SelectItem>
                    <SelectItem value="done">Done</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="mt-2 flex gap-2 text-[11px] text-muted-foreground">
                <span>Priority: {ticket.priority}</span>
                <span>Effort: {ticket.effort}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
