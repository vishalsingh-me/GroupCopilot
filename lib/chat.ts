import { nanoid } from "@/lib/uuid";
import type { Message } from "@/lib/types";

export function createMessage(role: Message["role"], sender: string, content: string): Message {
  const now = new Date().toISOString();
  return {
    id: nanoid(),
    role,
    sender,
    content,
    mode: "brainstorm",
    createdAt: now,
    timestamp: now
  };
}
