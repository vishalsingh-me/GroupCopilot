"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
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

  return (
    <div
      className={cn(
        "rounded-2xl border border-border p-4",
        message.role === "assistant" && "bg-muted/60",
        message.role === "system" && "bg-accent/10 border-accent/40"
      )}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold">{message.sender}</p>
          {message.role === "assistant" ? <Badge variant="accent">Assistant</Badge> : null}
          {message.role === "system" ? <Badge variant="outline">System</Badge> : null}
        </div>
        <span className="text-xs text-muted-foreground">
          {new Date(message.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </span>
      </div>
      <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">{content}</p>
      {isLong ? (
        <button
          className="mt-2 text-xs font-medium text-accent"
          onClick={() => setExpanded((prev) => !prev)}
        >
          {expanded ? "Show less" : "Show more"}
        </button>
      ) : null}
    </div>
  );
}
