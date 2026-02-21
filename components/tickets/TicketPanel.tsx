"use client";

import { useMemo, useState, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import TicketCard from "@/components/tickets/TicketCard";
import TicketList from "@/components/tickets/TicketList";
import Kanban from "@/components/tickets/Kanban";
import ToolConfirmDialog from "@/components/integrations/ToolConfirmDialog";
import { useRoomStore, createSystemMessage } from "@/lib/store";
import type { Ticket } from "@/lib/types";
import { seedTickets } from "@/lib/mock";
import { useToast } from "@/components/common/use-toast";

export default function TicketPanel() {
  const { tickets, setTickets, updateTicket, settings, addToolAction, updateToolAction, addMessage } = useRoomStore();
  const { toast } = useToast();
  const [editing, setEditing] = useState<Ticket | null>(null);
  const [view, setView] = useState<"list" | "kanban">("list");
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    if (tickets.length === 0) {
      setTickets(seedTickets);
    }
  }, [tickets.length, setTickets]);

  const suggested = useMemo(() => tickets.filter((ticket) => !ticket.accepted), [tickets]);
  const active = useMemo(() => tickets.filter((ticket) => ticket.accepted), [tickets]);

  const handleAccept = (ticket: Ticket) => {
    updateTicket({ ...ticket, accepted: true });
    toast({ title: "Ticket accepted", description: ticket.title });
  };

  const handleReject = (ticket: Ticket) => {
    updateTicket({ ...ticket, accepted: false });
    toast({ title: "Ticket rejected", description: ticket.title });
    addMessage(
      createSystemMessage(
        "Thanks for the feedback. Which part of the ticket should be adjusted so it fits your plan?",
        "planning"
      )
    );
  };

  const mutation = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/tools/notion/create-task", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tickets: active })
      });
      if (!response.ok) {
        throw new Error("Failed to create tasks");
      }
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Notion updated", description: "Mocked tasks created." });
      addMessage(createSystemMessage("Tool result: Notion tasks created.", "planning"));
    },
    onError: () => {
      toast({ title: "Tool call failed", description: "Retry when ready." });
    }
  });

  const handleCreateNotion = () => {
    const action = {
      id: Math.random().toString(36).slice(2, 9),
      tool: "notion" as const,
      status: "pending" as const,
      summary: "Create tickets in Notion",
      createdAt: new Date().toISOString()
    };
    addToolAction(action);
    mutation.mutate(undefined, {
      onSuccess: () => updateToolAction({ ...action, status: "success" }),
      onError: () => updateToolAction({ ...action, status: "error" })
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Suggested tickets</h2>
        <div className="flex gap-2">
          <Button size="sm" variant={view === "list" ? "secondary" : "outline"} onClick={() => setView("list")}
          >
            List
          </Button>
          <Button size="sm" variant={view === "kanban" ? "secondary" : "outline"} onClick={() => setView("kanban")}
          >
            Kanban
          </Button>
        </div>
      </div>
      {suggested.length === 0 ? (
        <p className="text-sm text-muted-foreground">No suggestions yet. Ask the assistant to generate tickets.</p>
      ) : (
        <TicketList
          tickets={suggested}
          onAccept={handleAccept}
          onEdit={setEditing}
          onReject={handleReject}
        />
      )}

      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Active tickets</h2>
        <Button
          size="sm"
          variant="outline"
          disabled={active.length === 0}
          onClick={() => (settings.requireToolConfirmation ? setConfirmOpen(true) : handleCreateNotion())}
        >
          Create in Notion
        </Button>
      </div>

      {view === "kanban" ? (
        <Kanban tickets={active} onUpdate={updateTicket} />
      ) : (
        <div className="flex flex-col gap-3">
          {active.length === 0 ? (
            <p className="text-sm text-muted-foreground">No active tickets yet.</p>
          ) : (
            active.map((ticket) => (
              <TicketCard key={ticket.id} ticket={ticket} onEdit={() => setEditing(ticket)} />
            ))
          )}
        </div>
      )}

      <Dialog open={!!editing} onOpenChange={() => setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit ticket</DialogTitle>
          </DialogHeader>
          {editing ? (
            <div className="grid gap-3">
              <Input
                value={editing.title}
                onChange={(event) => setEditing({ ...editing, title: event.target.value })}
              />
              <Textarea
                value={editing.description}
                onChange={(event) => setEditing({ ...editing, description: event.target.value })}
              />
              <Button
                onClick={() => {
                  updateTicket(editing);
                  setEditing(null);
                }}
              >
                Save
              </Button>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <ToolConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => {
          setConfirmOpen(false);
          handleCreateNotion();
        }}
        title="Create Notion tasks?"
        description="This will send accepted tickets to the MCP Notion tool."
      />
    </div>
  );
}
