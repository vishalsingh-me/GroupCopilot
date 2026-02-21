import type { MeetingSlot } from "@/lib/types";

type MeetingCardProps = {
  slot: MeetingSlot;
};

export default function MeetingCard({ slot }: MeetingCardProps) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-soft">
      <p className="text-sm font-semibold">
        {new Date(slot.start).toLocaleString([], {
          weekday: "short",
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit"
        })}
      </p>
      <p className="text-xs text-muted-foreground">
        Ends {new Date(slot.end).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
      </p>
      <p className="mt-2 text-xs text-muted-foreground">Score: {slot.score}</p>
    </div>
  );
}
