"use client";

import MessageItem from "@/components/chat/MessageItem";
import type { Message } from "@/lib/types";

type MessageListProps = {
  messages: Message[];
};

export default function MessageList({ messages }: MessageListProps) {
  return (
    <div className="flex flex-1 flex-col gap-4 overflow-y-auto pb-6">
      {messages.map((message) => (
        <MessageItem key={message.id} message={message} />
      ))}
    </div>
  );
}
