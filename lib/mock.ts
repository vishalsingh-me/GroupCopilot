import type { MeetingSlot, Ticket } from "@/lib/types";
import { nanoid } from "@/lib/uuid";

export const seedTickets: Ticket[] = [
  {
    id: nanoid(),
    title: "Define project scope",
    description: "Agree on the MVP and document what is out of scope.",
    suggestedOwnerUserId: undefined,
    ownerUserId: undefined,
    effort: "S",
    priority: "high",
    status: "todo",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: nanoid(),
    title: "Draft user interview questions",
    description: "Create a short script to validate assumptions with peers.",
    suggestedOwnerUserId: undefined,
    ownerUserId: undefined,
    effort: "M",
    priority: "med",
    status: "todo",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: nanoid(),
    title: "Storyboard the core flow",
    description: "Sketch the experience from kickoff to task creation.",
    suggestedOwnerUserId: undefined,
    ownerUserId: undefined,
    effort: "M",
    priority: "med",
    status: "todo",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
];

export const seedMeetingSlots = (): MeetingSlot[] => {
  const base = new Date();
  return Array.from({ length: 4 }).map((_, index) => {
    const start = new Date(base.getTime() + 36e5 * (index + 1));
    const end = new Date(start.getTime() + 30 * 60 * 1000);
    return {
      id: nanoid(),
      start: start.toISOString(),
      end: end.toISOString(),
      title: "Team sync",
      timezone: "UTC"
    };
  });
};
