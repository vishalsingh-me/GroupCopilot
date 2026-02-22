import { nanoid } from "@/lib/uuid";
import type { Message, Mode } from "@/lib/types";

export function createMessage(role: Message["role"], sender: string, content: string, mode: Mode): Message {
  const now = new Date().toISOString();
  return {
    id: nanoid(),
    role,
    sender,
    content,
    mode,
    createdAt: now,
    timestamp: now
  };
}
