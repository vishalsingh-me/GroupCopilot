import { nanoid } from "@/lib/uuid";
import type { Message, Mode } from "@/lib/types";

export function createMessage(role: Message["role"], sender: string, content: string, mode?: Mode): Message {
  return {
    id: nanoid(),
    role,
    sender,
    content,
    timestamp: new Date().toISOString(),
    mode
  };
}

export function streamMessage(
  fullContent: string,
  onUpdate: (partial: string) => void,
  onComplete: () => void
) {
  let index = 0;
  const interval = setInterval(() => {
    index += 2;
    onUpdate(fullContent.slice(0, index));
    if (index >= fullContent.length) {
      clearInterval(interval);
      onComplete();
    }
  }, 30);
  return () => clearInterval(interval);
}
