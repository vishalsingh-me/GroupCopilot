"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Sidebar from "@/components/layout/Sidebar";
import Topbar from "@/components/layout/Topbar";
import RightPanel from "@/components/layout/RightPanel";
import Composer from "@/components/chat/Composer";
import EmptyState from "@/components/common/EmptyState";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/common/use-toast";
import { useRoomStore } from "@/lib/store";
import type { Message } from "@/lib/types";

function PanelParamReader({ onPanelDetected }: { onPanelDetected?: () => void }) {
  const searchParams = useSearchParams();
  const panel = searchParams.get("panel");
  const { panelTab, setPanelTab } = useRoomStore();

  useEffect(() => {
    if (panel === "plan" || panel === "trello" || panel === "guide" || panel === "activity") {
      if (panel !== panelTab) {
        setPanelTab(panel);
      }
      onPanelDetected?.();
    }
  }, [panel, panelTab, setPanelTab, onPanelDetected]);

  return null;
}

function formatTimestamp(timestamp?: string) {
  if (!timestamp) return "";
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function GroupChatPage() {
  const params = useParams<{ code: string }>();
  const code = params.code;
  const router = useRouter();
  const { data: session, status } = useSession();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { room, setRoom } = useRoomStore();
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [mobilePanelOpen, setMobilePanelOpen] = useState(false);
  const [desktopPanelOpen, setDesktopPanelOpen] = useState(false);
  const openDesktopPanel = useCallback(() => setDesktopPanelOpen(true), []);

  useQuery({
    queryKey: ["room", code],
    queryFn: async () => {
      const res = await fetch(`/api/rooms/${code}`);
      if (!res.ok) throw new Error("Failed to load room");
      const data = await res.json();
      setRoom(data.room);
      return data.room;
    },
    enabled: status === "authenticated",
  });

  const groupMessagesQuery = useQuery({
    queryKey: ["group-messages", code],
    queryFn: async () => {
      const response = await fetch(`/api/rooms/${code}/group-messages`);
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error ?? "Failed to load group messages.");
      }
      return (payload?.messages ?? []) as Message[];
    },
    enabled: status === "authenticated",
    refetchInterval: 4000,
  });

  const sendMutation = useMutation({
    mutationFn: async (content: string) => {
      const response = await fetch(`/api/rooms/${code}/group-messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error ?? "Unable to send message.");
      }
      return payload?.message as Message | undefined;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["group-messages", code] });
    },
    onError: (error) => {
      toast({
        title: "Message failed",
        description: error instanceof Error ? error.message : "Unable to send message.",
        variant: "destructive",
      });
    },
  });

  const messages = useMemo(() => groupMessagesQuery.data ?? [], [groupMessagesQuery.data]);

  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages.length]);

  const handleSend = (value: string) => {
    if (!value.trim()) {
      toast({ title: "Message is empty", description: "Write something before sending." });
      return;
    }
    sendMutation.mutate(value);
  };

  if (status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">Loading your session...</p>
      </div>
    );
  }

  if (status === "unauthenticated") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background p-6 text-center">
        <p className="text-sm font-medium">You are not signed in.</p>
        <p className="text-xs text-muted-foreground">Sign in to continue to this room.</p>
        <Button onClick={() => router.push("/")}>Go to Sign In</Button>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-background">
      <Suspense fallback={null}>
        <PanelParamReader onPanelDetected={openDesktopPanel} />
      </Suspense>

      <Topbar
        onOpenSidebar={() => setSidebarOpen(true)}
        onTogglePanel={() => setDesktopPanelOpen((open) => !open)}
        onOpenMobilePanel={() => setMobilePanelOpen(true)}
        panelOpen={desktopPanelOpen}
      />

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex min-h-0 flex-1 flex-col">
          <div className="mx-auto flex min-h-0 w-full max-w-5xl flex-1 flex-col px-4 pb-4 pt-3">
            <div className="mb-3 rounded-xl border border-border/70 bg-card/70 p-3">
              <p className="text-sm font-semibold">Group Chat</p>
              <p className="text-xs text-muted-foreground">
                Room members can chat directly here. Plan Copilot is not involved.
              </p>
            </div>

            <div
              ref={scrollRef}
              className="no-scrollbar min-h-0 flex-1 overflow-y-auto rounded-xl border border-border/60 bg-card/40 p-3"
            >
              {groupMessagesQuery.isLoading ? (
                <p className="text-sm text-muted-foreground">Loading messages...</p>
              ) : groupMessagesQuery.isError ? (
                <p className="text-sm text-destructive">
                  {(groupMessagesQuery.error as Error).message}
                </p>
              ) : messages.length === 0 ? (
                <EmptyState
                  title="No messages yet"
                  description="Start the conversation with your team."
                />
              ) : (
                <div className="space-y-2.5">
                  {messages.map((message) => (
                    <article key={message.id} className="rounded-lg border border-border bg-background px-3 py-2">
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <p className="text-sm font-medium">{message.sender}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatTimestamp(message.timestamp ?? message.createdAt)}
                        </p>
                      </div>
                      <p className="whitespace-pre-wrap text-sm text-foreground">{message.content}</p>
                    </article>
                  ))}
                </div>
              )}
            </div>

            <Composer
              onSend={handleSend}
              disabled={sendMutation.isPending}
              showPresets={false}
            />
          </div>
        </main>

        {desktopPanelOpen ? (
          <RightPanel className="hidden lg:flex" onClose={() => setDesktopPanelOpen(false)} />
        ) : null}
      </div>

      <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
        <SheetTrigger asChild>
          <div />
        </SheetTrigger>
        <SheetContent side="left" className="p-0">
          <Sidebar className="flex w-full" />
        </SheetContent>
      </Sheet>

      <Sheet open={mobilePanelOpen} onOpenChange={setMobilePanelOpen}>
        <SheetTrigger asChild>
          <div />
        </SheetTrigger>
        <SheetContent side="right" className="p-0">
          <div className="h-full">
            <RightPanel className="flex h-full w-full" onClose={() => setMobilePanelOpen(false)} />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
