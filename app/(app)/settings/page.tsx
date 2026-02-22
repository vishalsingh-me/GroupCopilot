"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Trello, CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useRoomStore } from "@/lib/store";
import { useToast } from "@/components/common/use-toast";

type TrelloList = {
  id: string;
  name: string;
};

type TrelloStatus = {
  connected: boolean;
  configured?: boolean;
  trelloConfigured?: boolean;
  boardId?: string;
  boardShortLink?: string;
  boardUrl?: string;
  listId?: string | null;
  lists?: TrelloList[];
};

export default function SettingsPage() {
  const { resetState, room } = useRoomStore();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const code = room?.code;

  const [boardId, setBoardId] = useState("");
  const [selectedListId, setSelectedListId] = useState("");

  const statusQuery = useQuery({
    queryKey: ["status"],
    queryFn: async () => {
      const res = await fetch("/api/status");
      if (!res.ok) throw new Error("Failed to load status");
      return res.json() as Promise<{ mockLLM: boolean }>;
    }
  });

  const trelloQuery = useQuery({
    queryKey: ["trello-status", code],
    queryFn: async () => {
      const res = await fetch(`/api/rooms/${code}/trello`);
      if (!res.ok) throw new Error("Failed to load Trello status");
      return res.json() as Promise<TrelloStatus>;
    },
    enabled: Boolean(code)
  });

  const boardPreviewQuery = useQuery({
    queryKey: ["trello-board-preview", code, boardId.trim()],
    queryFn: async () => {
      const res = await fetch(`/api/rooms/${code}/trello?boardId=${encodeURIComponent(boardId.trim())}`);
      const payload = await res.json();
      if (!res.ok) throw new Error(payload?.error ?? "Failed to load board lists");
      return payload as TrelloStatus;
    },
    enabled: Boolean(code && boardId.trim()),
    retry: false,
  });

  const connectMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/rooms/${code}/trello`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          boardId: boardId.trim(),
          listId: selectedListId || undefined,
        })
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error ?? "Failed to connect Trello");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Trello connected" });
      queryClient.invalidateQueries({ queryKey: ["trello-status", code] });
      setBoardId("");
      setSelectedListId("");
    },
    onError: (err: Error) => {
      toast({ title: "Connection failed", description: err.message });
    }
  });

  const disconnectMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/rooms/${code}/trello`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to disconnect");
    },
    onSuccess: () => {
      toast({ title: "Trello disconnected" });
      queryClient.invalidateQueries({ queryKey: ["trello-status", code] });
    }
  });

  const trello = trelloQuery.data;
  const trelloConfigured = Boolean(trello?.trelloConfigured ?? trello?.configured);
  const previewLists = boardPreviewQuery.data?.lists ?? [];
  const canSubmitConnect =
    Boolean(boardId.trim()) &&
    !connectMutation.isPending &&
    !boardPreviewQuery.isLoading &&
    !boardPreviewQuery.isError &&
    previewLists.length > 0;

  return (
    <main className="min-h-screen bg-background px-6 py-10">
      <div className="mx-auto flex max-w-3xl flex-col gap-4 rounded-2xl border border-border bg-card p-6 shadow-soft">
        <Link href="/" className="text-sm text-muted-foreground">
          ← Back to home
        </Link>
        <h1 className="text-2xl font-semibold">Settings</h1>

        {/* Service status */}
        <div className="rounded-xl border border-border bg-muted/30 p-4">
          <p className="text-sm font-semibold">Service status</p>
          <p className="text-xs text-muted-foreground mt-1">
            LLM:{" "}
            {statusQuery.isLoading
              ? "Loading…"
              : statusQuery.data?.mockLLM
              ? "Mock mode (GEMINI_API_KEY missing)"
              : "Live (Gemini 3.0 Flash)"}
          </p>
        </div>

        {/* Trello integration */}
        <div className="rounded-xl border border-border bg-muted/30 p-4 flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <Trello className="h-4 w-4 text-muted-foreground" />
            <p className="text-sm font-semibold">Trello integration</p>
          </div>

          {!code ? (
            <p className="text-xs text-muted-foreground">
              Join or create a room first to connect Trello.
            </p>
          ) : !trelloConfigured ? (
            <p className="text-xs text-muted-foreground">
              Trello API credentials are not configured on this server.
              Add <code className="font-mono">TRELLO_API_KEY</code> and{" "}
              <code className="font-mono">TRELLO_TOKEN</code> to your environment.
            </p>
          ) : trello?.connected ? (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-1.5 text-xs text-green-700 dark:text-green-400">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Connected to board
              </div>
              <p className="text-xs text-muted-foreground font-mono">
                Board: {trello?.boardId ?? "—"}
              </p>
              {trello?.boardUrl ? (
                <a
                  href={trello?.boardUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-primary underline underline-offset-2"
                >
                  Open Trello board
                </a>
              ) : null}
              <p className="text-xs text-muted-foreground font-mono">
                List: {trello?.listId ?? "Auto (This Week / first open list)"}
              </p>
              <Button
                variant="destructive"
                size="sm"
                className="w-fit mt-1"
                onClick={() => disconnectMutation.mutate()}
                disabled={disconnectMutation.isPending}
              >
                Disconnect
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <XCircle className="h-3.5 w-3.5" />
                Not connected for room <span className="font-mono font-medium">{code}</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Enter your Trello board ID or shortLink from the Trello URL:{" "}
                <span className="font-mono">trello.com/b/&lt;boardId&gt;/...</span>.
                We'll fetch available lists and let you choose from a dropdown.
              </p>
              <div className="flex flex-col gap-2">
                <Input
                  placeholder="Trello board ID or shortLink (e.g. 699a... or VCx6xawE)"
                  value={boardId}
                  onChange={(e) => {
                    setBoardId(e.target.value);
                    setSelectedListId("");
                  }}
                />

                {boardId.trim() ? (
                  boardPreviewQuery.isLoading ? (
                    <p className="text-xs text-muted-foreground">Loading board lists…</p>
                  ) : boardPreviewQuery.isError ? (
                    <p className="text-xs text-destructive">
                      {(boardPreviewQuery.error as Error).message}
                    </p>
                  ) : (
                    <>
                      <label className="text-xs font-medium text-muted-foreground">Publish list</label>
                      <select
                        value={selectedListId}
                        onChange={(e) => setSelectedListId(e.target.value)}
                        className="h-10 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
                      >
                        <option value="">Auto (This Week, else first open list)</option>
                        {previewLists.map((list) => (
                          <option key={list.id} value={list.id}>
                            {list.name}
                          </option>
                        ))}
                      </select>
                    </>
                  )
                ) : null}

                <Button
                  size="sm"
                  className="w-fit"
                  onClick={() => connectMutation.mutate()}
                  disabled={!canSubmitConnect}
                >
                  {connectMutation.isPending ? "Connecting…" : "Connect Trello"}
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Privacy */}
        <div className="rounded-xl border border-border bg-muted/30 p-4">
          <p className="text-sm font-semibold">Privacy</p>
          <p className="text-xs text-muted-foreground mt-1">Clear local client state (room cache, message history).</p>
          <Button className="mt-2" variant="outline" onClick={resetState}>
            Clear my local data
          </Button>
        </div>
      </div>
    </main>
  );
}
