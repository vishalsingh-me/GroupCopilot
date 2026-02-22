"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowDown } from "lucide-react";
import MessageItem from "@/components/chat/MessageItem";
import type { Message } from "@/lib/types";
import { Button } from "@/components/ui/button";

type MessageListProps = {
  messages: Message[];
};

export default function MessageList({ messages }: MessageListProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const shouldAutoScrollRef = useRef(true);
  const [showScrollButton, setShowScrollButton] = useState(false);

  const handleScroll = () => {
    const container = scrollRef.current;
    if (!container) return;
    const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    const nearBottom = distanceFromBottom < 120;
    shouldAutoScrollRef.current = nearBottom;
    setShowScrollButton(!nearBottom);
  };

  useEffect(() => {
    const container = scrollRef.current;
    if (!container || !shouldAutoScrollRef.current) return;
    container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const scrollToBottom = () => {
    const container = scrollRef.current;
    if (!container) return;
    shouldAutoScrollRef.current = true;
    container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
    setShowScrollButton(false);
  };

  return (
    <div className="relative min-h-0 flex-1">
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="no-scrollbar flex h-full min-h-0 flex-col gap-5 overflow-y-auto px-1 pb-28 pt-4"
      >
        {messages.map((message) => (
          <MessageItem key={message.id} message={message} />
        ))}
      </div>
      {showScrollButton ? (
        <Button
          size="icon"
          variant="outline"
          onClick={scrollToBottom}
          className="absolute bottom-32 right-4 rounded-full bg-background/95 shadow-soft"
          aria-label="Scroll to latest message"
        >
          <ArrowDown className="h-4 w-4" />
        </Button>
      ) : null}
    </div>
  );
}
