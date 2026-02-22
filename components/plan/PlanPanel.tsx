"use client";

import { useQuery } from "@tanstack/react-query";
import { useRoomStore } from "@/lib/store";
import { AGENT_STATE_LABELS } from "@/lib/types";
import type { AgentSessionData } from "@/lib/types";

const ACTIVE_STATES = new Set([
  "WEEKLY_KICKOFF", "SKELETON_DRAFT", "SKELETON_QA",
  "APPROVAL_GATE_1", "PLANNING_MEETING", "TASK_PROPOSALS",
  "APPROVAL_GATE_2", "TRELLO_PUBLISH", "MONITOR", "WEEKLY_REVIEW",
]);

export default function PlanPanel() {
  const { room } = useRoomStore();
  const code = room?.code;

  const { data, isLoading } = useQuery({
    queryKey: ["session", code],
    queryFn: async () => {
      const res = await fetch(`/api/rooms/${code}/session`);
      if (!res.ok) throw new Error("Failed to load session");
      return res.json() as Promise<{ session: AgentSessionData | null }>;
    },
    enabled: Boolean(code),
    refetchInterval: 5000,
  });

  const session = data?.session;

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  if (!session || session.state === "IDLE") {
    return (
      <div className="rounded-xl border border-border bg-muted/30 p-4 text-center">
        <p className="text-sm font-medium">No active planning session</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Send a message to kick off this week's planning.
        </p>
      </div>
    );
  }

  const skeleton = session.data.skeletonDraft ?? [];
  const proposals = session.data.taskProposals ?? [];
  const isActive = ACTIVE_STATES.has(session.state);

  return (
    <div className="flex flex-col gap-4">
      {/* Phase indicator */}
      <div className="rounded-xl border border-border bg-muted/30 p-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Week {session.weekNumber}
        </p>
        <div className="mt-1.5 flex items-center gap-2">
          {isActive && (
            <span className="h-2 w-2 animate-pulse rounded-full bg-primary" />
          )}
          <p className="text-sm font-medium text-foreground">
            {AGENT_STATE_LABELS[session.state]}
          </p>
        </div>
      </div>

      {/* Milestone skeleton */}
      {skeleton.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Milestone Skeleton
          </p>
          <ul className="space-y-2">
            {skeleton.map((m, i) => (
              <li key={i} className="flex gap-2 rounded-xl border border-border bg-card p-2.5 text-sm">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary">
                  {i + 1}
                </span>
                <span>{m}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Task proposals */}
      {proposals.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Task Proposals
          </p>
          <ul className="space-y-2">
            {proposals.map((t, i) => (
              <li key={i} className="rounded-xl border border-border bg-card p-2.5">
                <p className="text-sm font-medium">{t.title}</p>
                {t.description && (
                  <p className="mt-0.5 text-xs text-muted-foreground">{t.description}</p>
                )}
                {t.suggestedOwnerName && (
                  <p className="mt-1 text-xs text-primary">→ {t.suggestedOwnerName}</p>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
