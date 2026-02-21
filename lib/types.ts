export type Role = "student" | "ta" | "instructor" | "team member";

export type MessageRole = "assistant" | "user" | "system";

export type Mode = "brainstorm" | "planning" | "conflict" | "general";

export type Message = {
  id: string;
  role: MessageRole;
  sender: string;
  content: string;
  timestamp: string;
  mode?: Mode;
};

export type Room = {
  id: string;
  name: string;
  code: string;
  members: Array<{ id: string; name: string; role?: Role }>;
};

export type TicketStatus = "todo" | "doing" | "done";

export type Ticket = {
  id: string;
  title: string;
  description: string;
  suggestedOwner?: string;
  effort: "S" | "M" | "L";
  priority: "Low" | "Medium" | "High";
  status: TicketStatus;
  accepted: boolean;
};

export type MeetingSlot = {
  id: string;
  start: string;
  end: string;
  score: number;
};

export type ToolAction = {
  id: string;
  tool: "notion" | "calendar";
  status: "pending" | "success" | "error";
  summary: string;
  createdAt: string;
};

export type IntegrationStatus = {
  notion: "connected" | "disconnected" | "mock";
  calendar: "connected" | "disconnected" | "mock";
};

export type Profile = {
  name: string;
  role?: Role;
};

export type KnowledgeItem = {
  id: string;
  title: string;
  content: string;
  createdAt: string;
};
