"use client";

import { useQuery } from "@tanstack/react-query";
import { ExternalLink, Trello } from "lucide-react";
import { useRoomStore } from "@/lib/store";
import type { TrelloCard } from "@/lib/types";

const STATUS_COLORS: Record<string, string> = {
  "To Do": "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  "In Progress": "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  "Done": "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
  "Complete": "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
  "Completed": "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
};

function statusColor(status: string): string {
  return STATUS_COLORS[status] ?? "bg-muted text-muted-foreground";
}

export default function TrelloPanel() {
  const { room } = useRoomStore();
  const code = room?.code;

  const { data, isLoading, isError } = useQuery({
    queryKey: ["trello-cards", code],
    queryFn: async () => {
      const res = await fetch(`/api/rooms/${code}/trello/cards`);
      if (!res.ok) throw new Error("Failed to load Trello cards");
      return res.json() as Promise<{ connected: boolean; stale?: boolean; cards: TrelloCard[] }>;
    },
    enabled: Boolean(code),
    refetchInterval: 30_000,
  });

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading Trello cards…</p>;
  }

  if (isError || !data?.connected) {
    return (
      <div className="rounded-xl border border-border bg-muted/30 p-4 text-center">
        <Trello className="mx-auto mb-2 h-6 w-6 text-muted-foreground" />
        <p className="text-sm font-medium">Trello not connected</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Go to{" "}
          <a href="/settings" className="underline hover:text-foreground">
            Settings
          </a>{" "}
          to connect a Trello board.
        </p>
        {data?.stale && data.cards.length > 0 && (
          <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
            Showing cached data (Trello unreachable)
          </p>
        )}
      </div>
    );
  }

  const cards = data.cards ?? [];

  if (cards.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-muted/30 p-4 text-center">
        <p className="text-sm text-muted-foreground">No cards on the board yet.</p>
        <p className="text-xs text-muted-foreground mt-1">Cards will appear here after the group approves the task plan.</p>
      </div>
    );
  }

  // Group by status
  const groups = cards.reduce<Record<string, TrelloCard[]>>((acc, card) => {
    (acc[card.status] ??= []).push(card);
    return acc;
  }, {});

  return (
    <div className="flex flex-col gap-4">
      {data.stale && (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          Showing cached data — Trello unreachable.
        </p>
      )}
      {Object.entries(groups).map(([status, groupCards]) => (
        <div key={status}>
          <div className="mb-1.5 flex items-center gap-2">
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${statusColor(status)}`}>
              {status}
            </span>
            <span className="text-xs text-muted-foreground">{groupCards.length}</span>
          </div>
          <ul className="space-y-1.5">
            {groupCards.map((card) => (
              <li
                key={card.id}
                className="flex items-start justify-between gap-2 rounded-xl border border-border bg-card px-3 py-2.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{card.title}</p>
                  {card.dueDate && (
                    <p className="text-xs text-muted-foreground">
                      Due {new Date(card.dueDate).toLocaleDateString()}
                    </p>
                  )}
                </div>
                {card.url && (
                  <a
                    href={card.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 text-muted-foreground hover:text-foreground"
                    aria-label="Open in Trello"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
