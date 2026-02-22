"use client";

import { useQuery } from "@tanstack/react-query";
import { useRoomStore } from "@/lib/store";
import type { AuditLogEntry } from "@/lib/types";

const EVENT_LABELS: Record<string, string> = {
  gate_1_opened: "Gate 1 opened",
  gate_2_opened: "Gate 2 opened",
  gate_skeleton_approved: "Skeleton approved",
  gate_skeleton_rejected: "Changes requested on skeleton",
  gate_task_plan_approved: "Task plan approved",
  gate_task_plan_rejected: "Changes requested on task plan",
  vote_cast: "Vote cast",
  trello_cards_published: "Tasks published to Trello",
  trello_publish_skipped: "Trello publish skipped (not connected)",
  monitor_nudge_sent: "Stall nudge sent",
  weekly_review_completed: "Weekly review completed",
  state_reverted: "Agent revised draft",
};

function label(type: string) {
  return EVENT_LABELS[type] ?? type.replace(/_/g, " ");
}

export default function ActivityPanel() {
  const { room } = useRoomStore();
  const code = room?.code;

  const { data, isLoading } = useQuery({
    queryKey: ["audit", code],
    queryFn: async () => {
      const res = await fetch(`/api/audit?roomCode=${code}&limit=30`);
      if (!res.ok) throw new Error("Failed to load audit log");
      return res.json() as Promise<{ logs: AuditLogEntry[] }>;
    },
    enabled: Boolean(code),
    refetchInterval: 10_000,
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;

  const logs = data?.logs ?? [];

  if (logs.length === 0) {
    return <p className="text-sm text-muted-foreground">No activity yet.</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      {logs.map((log) => (
        <div key={log.id} className="rounded-xl border border-border bg-card px-3 py-2.5">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium capitalize">{label(log.type)}</p>
            <time className="shrink-0 text-xs text-muted-foreground">
              {new Date(log.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </time>
          </div>
          {log.actor && (
            <p className="text-xs text-muted-foreground">{log.actor.name ?? log.actor.email}</p>
          )}
        </div>
      ))}
    </div>
  );
}
