"use client";

import { useState } from "react";
import ConflictCard, { type ConflictCardData } from "@/components/conflict/ConflictCard";
import { cn } from "@/lib/utils";
import type { Message } from "@/lib/types";

type MessageItemProps = {
  message: Message;
};

const MAX_PREVIEW = 320;

export default function MessageItem({ message }: MessageItemProps) {
  const [expanded, setExpanded] = useState(false);
  const conflictData = parseConflictPayload(message);
  const isLong = !conflictData && message.content.length > MAX_PREVIEW;
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
          {conflictData ? (
            <ConflictCard data={conflictData} />
          ) : (
            content
          )}
        </div>
        {isLong && !conflictData ? (
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

function parseConflictPayload(message: Message): ConflictCardData | null {
  if (message.mode !== "conflict" || message.role !== "assistant") {
    return null;
  }

  const raw = isRecord(message.metadata)
    ? message.metadata
    : parseUnknownJson(message.content);

  if (!isRecord(raw) || raw.mode !== "conflict") {
    return null;
  }

  const neutralSummary = typeof raw.neutral_summary === "string"
    ? raw.neutral_summary.trim()
    : "";
  const suggestedScript = isRecord(raw.suggested_script) && typeof raw.suggested_script.text === "string"
    ? raw.suggested_script.text.trim()
    : "";
  const nextQuestion = isRecord(raw.follow_up) && typeof raw.follow_up.next_question === "string"
    ? raw.follow_up.next_question.trim()
    : "";
  const confidence = typeof raw.confidence === "number" ? raw.confidence : 0;

  if (!neutralSummary || !suggestedScript) {
    return null;
  }

  const clarifyingQuestions = Array.isArray(raw.clarifying_questions)
    ? raw.clarifying_questions
      .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
      .slice(0, 3)
    : [];

  const options = Array.isArray(raw.options)
    ? raw.options
      .map((option) => {
        if (!isRecord(option)) {
          return null;
        }
        const title = typeof option.title === "string" ? option.title.trim() : "";
        const description = typeof option.description === "string" ? option.description.trim() : "";
        if (!title || !description) {
          return null;
        }
        return {
          title,
          description
        };
      })
      .filter((value): value is { title: string; description: string } => Boolean(value))
      .slice(0, 3)
    : [];

  return {
    neutralSummary,
    clarifyingQuestions,
    options,
    suggestedScript,
    nextQuestion,
    confidence
  };
}

function parseUnknownJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}
