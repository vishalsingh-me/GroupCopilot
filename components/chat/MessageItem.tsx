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
  const conflictCard = parseConflictCard(message.metadata);
  const isLong = message.content.length > MAX_PREVIEW;
  const content = isLong && !expanded ? `${message.content.slice(0, MAX_PREVIEW)}...` : message.content;
  const isUser = message.role === "user";
  const isAssistant = message.role === "assistant";
  const isSystem = message.role === "system";
  const isTool = message.role === "tool";
  const isTranscriptMessage = isUser || isAssistant;
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
          {conflictCard ? (
            <ConflictCard data={conflictCard} />
          ) : (
            <p
              className={cn(
                isTranscriptMessage && "font-chatSerif text-[16px] leading-7 tracking-normal sm:text-[17px]"
              )}
            >
              {content}
            </p>
          )}
        </div>
        {isLong && !conflictCard ? (
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

function parseConflictCard(metadata: unknown): ConflictCardData | null {
  if (!isRecord(metadata)) return null;
  if (metadata.kind !== "conflict_mediation") return null;

  const conflict = metadata.conflict;
  if (isRecord(conflict)) {
    const status = typeof conflict.status === "string" ? conflict.status : "";
    const safety = conflict.safety;
    const risk = isRecord(safety) && typeof safety.risk_level === "string" ? safety.risk_level : "";
    if (status === "safety_escalation" || risk === "high") {
      return null;
    }
  }

  const card = metadata.conflictCard;
  if (!isRecord(card)) return null;

  const neutralSummary = typeof card.neutralSummary === "string" ? card.neutralSummary.trim() : "";
  const suggestedScript = typeof card.suggestedScript === "string" ? card.suggestedScript.trim() : "";
  const nextQuestion = typeof card.nextQuestion === "string" ? card.nextQuestion.trim() : "";
  const confidence = typeof card.confidence === "number" ? card.confidence : 0;

  const clarifyingQuestions = Array.isArray(card.clarifyingQuestions)
    ? card.clarifyingQuestions
      .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
      .slice(0, 3)
    : [];

  const options = Array.isArray(card.options)
    ? card.options
      .map((option) => {
        if (!isRecord(option)) return null;
        const title = typeof option.title === "string" ? option.title.trim() : "";
        const description = typeof option.description === "string" ? option.description.trim() : "";
        if (!title || !description) return null;
        return { title, description };
      })
      .filter((value): value is { title: string; description: string } => Boolean(value))
      .slice(0, 3)
    : [];

  if (!neutralSummary || !suggestedScript) return null;

  return {
    neutralSummary,
    clarifyingQuestions,
    options,
    suggestedScript,
    nextQuestion,
    confidence,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}
