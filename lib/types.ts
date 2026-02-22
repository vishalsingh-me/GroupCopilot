export const ALLOWED_MODES = [
  "brainstorm",
  "clarify",
  "tickets",
  "schedule",
  "conflict"
] as const;

export type Mode = (typeof ALLOWED_MODES)[number];

export function isMode(value: unknown): value is Mode {
  return typeof value === "string" && ALLOWED_MODES.includes(value as Mode);
}

export function normalizeMode(value: unknown, fallback: Mode = "brainstorm"): Mode {
  return isMode(value) ? value : fallback;
}

export type MessageRole = "assistant" | "user" | "system" | "tool";

export type Message = {
  id: string;
  role: MessageRole;
  sender: string;
  content: string;
  mode: Mode;
  metadata?: unknown;
  createdAt: string;
  timestamp?: string;
};

export type RoomMember = {
  id: string;
  name: string;
  email?: string;
  role?: string | null;
  image?: string | null;
};

export type Room = {
  id: string;
  name?: string | null;
  code: string;
  members: RoomMember[];
};

export type TicketStatus = "todo" | "doing" | "done";

export type TicketPriority = "low" | "med" | "high";

export type TicketEffort = "S" | "M" | "L";

export type Ticket = {
  id: string;
  title: string;
  description: string;
  suggestedOwnerUserId?: string | null;
  ownerUserId?: string | null;
  priority: TicketPriority;
  effort: TicketEffort;
  status: TicketStatus;
  createdAt: string;
  updatedAt: string;
};

export type MeetingProposal = {
  title: string;
  start: string;
  end: string;
  timezone?: string;
};

export type MeetingSlot = MeetingProposal & { id?: string };

export type ToolAction = {
  id: string;
  type: "notion_create_task" | "calendar_create_event";
  status: "pending" | "success" | "error";
  payload: unknown;
  result?: unknown;
  createdAt: string;
  confirmedAt?: string | null;
};
