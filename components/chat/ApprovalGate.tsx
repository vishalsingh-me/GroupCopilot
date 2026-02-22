"use client";

import { useState } from "react";
import { Check, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ApprovalGateData, TaskProposal } from "@/lib/types";

type ApprovalGateProps = {
  approval: ApprovalGateData;
  onVote: (vote: "approve" | "request_change", comment?: string) => Promise<void>;
  disabled?: boolean;
};

export default function ApprovalGate({ approval, onVote, disabled }: ApprovalGateProps) {
  const [comment, setComment] = useState("");
  const [pending, setPending] = useState<"approve" | "request_change" | null>(null);

  const isSkeleton = approval.type === "SKELETON";
  const payload = approval.payload as Record<string, unknown>;

  const milestones = isSkeleton
    ? (payload.milestones as string[] | undefined) ?? []
    : [];
  const tasks = !isSkeleton
    ? (payload.tasks as TaskProposal[] | undefined) ?? []
    : [];

  const alreadyVoted = approval.userVote !== null;

  async function handleVote(vote: "approve" | "request_change") {
    setPending(vote);
    try {
      await onVote(vote, comment.trim() || undefined);
    } finally {
      setPending(null);
      setComment("");
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl rounded-2xl border-2 border-primary/20 bg-card p-4 shadow-sm">
      {/* Header */}
      <div className="mb-3 flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-foreground">
            {isSkeleton ? "Gate 1 — Milestone Skeleton" : "Gate 2 — Task Plan"}
          </p>
          <p className="text-xs text-muted-foreground">
            {approval.approveCount}/{approval.memberCount} approved
            {approval.changeCount > 0 && ` · ${approval.changeCount} requested changes`}
          </p>
        </div>
        {alreadyVoted && (
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
            {approval.userVote === "approve" ? "You approved" : "You requested changes"}
          </span>
        )}
      </div>

      {/* Payload */}
      <div className="mb-4 rounded-xl bg-muted/40 p-3 text-sm">
        {isSkeleton ? (
          <ul className="space-y-1.5">
            {milestones.map((m, i) => (
              <li key={i} className="flex gap-2">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary">
                  {i + 1}
                </span>
                <span className="text-foreground">{m}</span>
              </li>
            ))}
          </ul>
        ) : (
          <ul className="space-y-2">
            {tasks.map((t, i) => (
              <li key={i} className="rounded-lg border border-border bg-background p-2.5">
                <p className="font-medium text-foreground">{t.title}</p>
                {t.description && (
                  <p className="mt-0.5 text-xs text-muted-foreground">{t.description}</p>
                )}
                {t.suggestedOwnerName && (
                  <p className="mt-1 text-xs text-primary">→ {t.suggestedOwnerName}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Comment input */}
      {!alreadyVoted && (
        <div className="mb-3">
          <textarea
            className="w-full resize-none rounded-xl border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            rows={2}
            placeholder="Optional comment (required if requesting changes)…"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            disabled={!!pending || disabled}
          />
        </div>
      )}

      {/* Actions */}
      {!alreadyVoted && (
        <div className="flex gap-2">
          <Button
            size="sm"
            className="flex-1"
            onClick={() => handleVote("approve")}
            disabled={!!pending || disabled}
          >
            <Check className="mr-1.5 h-3.5 w-3.5" />
            {pending === "approve" ? "Approving…" : "Approve"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="flex-1"
            onClick={() => handleVote("request_change")}
            disabled={(!!pending || disabled) || comment.trim().length === 0}
          >
            <MessageSquare className="mr-1.5 h-3.5 w-3.5" />
            {pending === "request_change" ? "Sending…" : "Request Changes"}
          </Button>
        </div>
      )}

      {alreadyVoted && (
        <p className="text-center text-xs text-muted-foreground">
          Waiting for {approval.memberCount - approval.approveCount - approval.changeCount} more member(s) to vote.
        </p>
      )}
    </div>
  );
}
