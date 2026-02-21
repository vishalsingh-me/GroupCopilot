"use client";

import type { Ticket, TicketStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

type KanbanProps = {
  tickets: Ticket[];
  onUpdate: (ticket: Ticket) => void;
};

const columns: { key: TicketStatus; label: string }[] = [
  { key: "todo", label: "To Do" },
  { key: "doing", label: "Doing" },
  { key: "done", label: "Done" }
];

export default function Kanban({ tickets, onUpdate }: KanbanProps) {
  return (
    <div className="grid gap-3 lg:grid-cols-3">
      {columns.map((column) => (
        <div key={column.key} className="rounded-2xl border border-border bg-muted/30 p-3">
          <p className="text-xs font-semibold uppercase text-muted-foreground">{column.label}</p>
          <div className="mt-3 flex flex-col gap-2">
            {tickets.filter((ticket) => ticket.status === column.key).length === 0 ? (
              <p className="text-xs text-muted-foreground">No tickets</p>
            ) : (
              tickets
                .filter((ticket) => ticket.status === column.key)
                .map((ticket) => (
                  <div key={ticket.id} className="rounded-xl border border-border bg-card p-3">
                    <p className="text-sm font-semibold">{ticket.title}</p>
                    <div className="mt-2 flex gap-2">
                      {columns.map((target) => (
                        <button
                          key={target.key}
                          className={cn(
                            "rounded-full border px-2 py-1 text-[10px] uppercase",
                            ticket.status === target.key ? "bg-accent text-accent-foreground" : "border-border"
                          )}
                          onClick={() => onUpdate({ ...ticket, status: target.key })}
                        >
                          {target.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ))
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
