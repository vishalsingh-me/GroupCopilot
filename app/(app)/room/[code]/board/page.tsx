"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink, ArrowLeft, Trello } from "lucide-react";
import { Button } from "@/components/ui/button";

type Card = {
  id: string;
  title: string;
  description?: string;
  status: string;
  dueDate?: string | null;
  url?: string | null;
  idMembers?: string[];
};

type CardsResponse = {
  connected: boolean;
  stale?: boolean;
  cards: Card[];
};

const STATUS_ORDER = ["To Do", "This Week", "In Progress", "Review", "Done", "Complete", "Completed"];

const STATUS_COLORS: Record<string, { bg: string; label: string }> = {
  "To Do":      { bg: "bg-slate-100 dark:bg-slate-800",   label: "text-slate-700 dark:text-slate-300" },
  "This Week":  { bg: "bg-indigo-50 dark:bg-indigo-900/30", label: "text-indigo-700 dark:text-indigo-300" },
  "In Progress":{ bg: "bg-blue-50 dark:bg-blue-900/30",   label: "text-blue-700 dark:text-blue-300" },
  "Review":     { bg: "bg-amber-50 dark:bg-amber-900/30", label: "text-amber-700 dark:text-amber-300" },
  "Done":       { bg: "bg-green-50 dark:bg-green-900/30", label: "text-green-700 dark:text-green-300" },
  "Complete":   { bg: "bg-green-50 dark:bg-green-900/30", label: "text-green-700 dark:text-green-300" },
  "Completed":  { bg: "bg-green-50 dark:bg-green-900/30", label: "text-green-700 dark:text-green-300" },
};

function statusStyle(status: string) {
  return STATUS_COLORS[status] ?? { bg: "bg-muted", label: "text-muted-foreground" };
}

export default function BoardPage() {
  const params = useParams<{ code: string }>();
  const code = params.code;
  const { data: session } = useSession();

  const cardsQuery = useQuery<CardsResponse>({
    queryKey: ["trello-cards-board", code],
    queryFn: async () => {
      const res = await fetch(`/api/rooms/${code}/trello/cards`);
      if (!res.ok) throw new Error("Failed to load cards");
      return res.json();
    },
    enabled: !!session,
    refetchInterval: 30_000,
  });

  const trelloStatusQuery = useQuery({
    queryKey: ["trello-status-board", code],
    queryFn: async () => {
      const res = await fetch(`/api/rooms/${code}/trello`);
      if (!res.ok) return null;
      return res.json() as Promise<{ boardId?: string; listId?: string; connected?: boolean } | null>;
    },
    enabled: !!session,
  });

  const data = cardsQuery.data;
  const cards = data?.cards ?? [];

  // Group and sort by STATUS_ORDER
  const groups = cards.reduce<Record<string, Card[]>>((acc, card) => {
    (acc[card.status] ??= []).push(card);
    return acc;
  }, {});

  const sortedStatuses = [
    ...STATUS_ORDER.filter((s) => groups[s]),
    ...Object.keys(groups).filter((s) => !STATUS_ORDER.includes(s)),
  ];

  const boardUrl = trelloStatusQuery.data?.boardId
    ? `https://trello.com/b/${trelloStatusQuery.data.boardId}`
    : null;

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-7xl px-4 py-6">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href={`/room/${code}`}>
              <Button variant="ghost" size="sm">
                <ArrowLeft className="mr-1.5 h-4 w-4" />
                Back to chat
              </Button>
            </Link>
            <div className="h-5 w-px bg-border" />
            <Trello className="h-5 w-5 text-blue-500" />
            <h1 className="text-lg font-semibold">Task Board</h1>
            {data?.stale && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                Cached
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {boardUrl && (
              <a href={boardUrl} target="_blank" rel="noopener noreferrer">
                <Button variant="outline" size="sm">
                  <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                  Open in Trello
                </Button>
              </a>
            )}
            <Link href={`/settings`}>
              <Button variant="ghost" size="sm" className="text-muted-foreground">
                Settings
              </Button>
            </Link>
          </div>
        </div>

        {/* States */}
        {cardsQuery.isLoading && (
          <div className="flex items-center justify-center py-20 text-sm text-muted-foreground">
            Loading board…
          </div>
        )}

        {cardsQuery.isError && (
          <div className="flex flex-col items-center justify-center gap-2 py-20 text-center">
            <p className="text-sm text-muted-foreground">Failed to load Trello cards.</p>
            <Button variant="outline" size="sm" onClick={() => cardsQuery.refetch()}>
              Retry
            </Button>
          </div>
        )}

        {!cardsQuery.isLoading && !cardsQuery.isError && !data?.connected && (
          <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
            <Trello className="h-10 w-10 text-muted-foreground" />
            <p className="text-sm font-medium">Trello not connected</p>
            <p className="text-xs text-muted-foreground">
              Connect a Trello board in{" "}
              <Link href="/settings" className="underline hover:text-foreground">
                Settings
              </Link>{" "}
              to see cards here.
            </p>
          </div>
        )}

        {data?.connected && cards.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-2 py-20 text-center">
            <p className="text-sm text-muted-foreground">No cards on this board yet.</p>
            <p className="text-xs text-muted-foreground">
              Cards appear after the group approves the task plan.
            </p>
          </div>
        )}

        {/* Kanban columns */}
        {data?.connected && cards.length > 0 && (
          <div className="flex gap-4 overflow-x-auto pb-4">
            {sortedStatuses.map((status) => {
              const style = statusStyle(status);
              const columnCards = groups[status] ?? [];
              return (
                <div
                  key={status}
                  className={`flex min-w-[260px] max-w-[300px] flex-col rounded-2xl ${style.bg} p-3`}
                >
                  <div className="mb-3 flex items-center justify-between">
                    <span className={`text-xs font-semibold uppercase tracking-wide ${style.label}`}>
                      {status}
                    </span>
                    <span className={`text-xs font-medium ${style.label} opacity-70`}>
                      {columnCards.length}
                    </span>
                  </div>
                  <ul className="flex flex-col gap-2">
                    {columnCards.map((card) => (
                      <li
                        key={card.id}
                        className="rounded-xl border border-border bg-card p-3 shadow-sm"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-medium leading-snug">{card.title}</p>
                          {card.url && (
                            <a
                              href={card.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="shrink-0 text-muted-foreground hover:text-foreground"
                              aria-label="Open card in Trello"
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                            </a>
                          )}
                        </div>
                        {card.description && (
                          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                            {card.description}
                          </p>
                        )}
                        {card.dueDate && (
                          <p className="mt-1.5 text-[10px] text-muted-foreground">
                            Due {new Date(card.dueDate).toLocaleDateString()}
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
