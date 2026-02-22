"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Ticket } from "@/lib/types";

type TicketCardProps = {
  ticket: Ticket;
  onAccept?: () => void;
  onEdit?: () => void;
  onReject?: () => void;
};

export default function TicketCard({ ticket, onAccept, onEdit, onReject }: TicketCardProps) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-soft">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">{ticket.title}</h3>
          <p className="mt-1 text-xs text-muted-foreground">{ticket.description}</p>
        </div>
        <Badge variant={ticket.priority === "high" ? "accent" : "outline"}>
          {ticket.priority}
        </Badge>
      </div>
      <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
        <span>Owner: {ticket.ownerUserId ?? ticket.suggestedOwnerUserId ?? "Unassigned"}</span>
        <span>Effort: {ticket.effort}</span>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {onAccept ? (
          <Button size="sm" onClick={onAccept}>
            Accept
          </Button>
        ) : null}
        {onEdit ? (
          <Button size="sm" variant="secondary" onClick={onEdit}>
            Edit
          </Button>
        ) : null}
        {onReject ? (
          <Button size="sm" variant="ghost" onClick={onReject}>
            Reject
          </Button>
        ) : null}
      </div>
    </div>
  );
}
