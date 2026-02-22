import type { Ticket } from "@/lib/types";
import TicketCard from "@/components/tickets/TicketCard";

type TicketListProps = {
  tickets: Ticket[];
  onAccept?: (ticket: Ticket) => void;
  onEdit?: (ticket: Ticket) => void;
  onReject?: (ticket: Ticket) => void;
};

export default function TicketList({ tickets, onAccept, onEdit, onReject }: TicketListProps) {
  return (
    <div className="flex flex-col gap-3">
      {tickets.map((ticket) => (
        <TicketCard
          key={ticket.id}
          ticket={ticket}
          onAccept={onAccept ? () => onAccept(ticket) : undefined}
          onEdit={onEdit ? () => onEdit(ticket) : undefined}
          onReject={onReject ? () => onReject(ticket) : undefined}
        />
      ))}
    </div>
  );
}
