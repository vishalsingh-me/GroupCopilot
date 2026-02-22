"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import type { Message } from "@/lib/types";

type MessageItemProps = {
  message: Message;
};

const MAX_PREVIEW = 320;

export default function MessageItem({ message }: MessageItemProps) {
  const [expanded, setExpanded] = useState(false);
  const isLong = message.content.length > MAX_PREVIEW;
  const content = isLong && !expanded ? `${message.content.slice(0, MAX_PREVIEW)}...` : message.content;
  const isUser = message.role === "user";
  const isAssistant = message.role === "assistant";
  const isSystem = message.role === "system";
  const isTool = message.role === "tool";
  const sender = isAssistant ? "Assistant" : message.sender;
  const timestamp = message.timestamp ?? message.createdAt;

  return (
    <article className={cn("flex w-full", isUser ? "justify-end" : "justify-start")}>
      <div className={cn("w-full max-w-3xl space-y-1.5", isUser ? "max-w-2xl" : "")}>
        <div
          className={cn(
            "flex items-center gap-2 text-xs text-muted-foreground",
            isUser ? "justify-end" : "justify-start"
          )}
        >
          <span className="font-medium">{sender}</span>
          <span>
            {timestamp
              ? new Date(timestamp).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit"
              })
              : ""}
          </span>
        </div>
        <div
          className={cn(
            "whitespace-pre-wrap text-sm leading-relaxed",
            isUser && "rounded-2xl bg-secondary px-4 py-3 text-secondary-foreground",
            isAssistant && "px-1 py-1 text-foreground",
            isSystem && "rounded-xl bg-muted px-3 py-2 text-muted-foreground",
            isTool && "rounded-xl border border-border bg-card px-3 py-2 text-foreground"
          )}
        >
          {content}
        </div>
        {isLong ? (
          <button
            className={cn(
              "text-xs font-medium text-muted-foreground hover:text-foreground",
              isUser ? "ml-auto block" : "mr-auto"
            )}
            onClick={() => setExpanded((prev) => !prev)}
          >
            {expanded ? "Show less" : "Show more"}
          </button>
        ) : null}
      </div>
    </article>
  );
}
