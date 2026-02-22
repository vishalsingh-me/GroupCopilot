"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { Plus, ShieldAlert, X } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Sidebar from "@/components/layout/Sidebar";
import Topbar from "@/components/layout/Topbar";
import RightPanel from "@/components/layout/RightPanel";
import MessageList from "@/components/chat/MessageList";
import Composer from "@/components/chat/Composer";
import EmptyState from "@/components/common/EmptyState";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/common/use-toast";
import { useRoomStore } from "@/lib/store";
import { createMessage } from "@/lib/chat";
import type { ConversationThread, Message } from "@/lib/types";

type LLMDiagnostic = {
  hasApiKey: boolean;
  model: string;
  status: "ok" | "mock" | "error";
  latencyMs: number | null;
  errorType: string | null;
  errorMessageSafe: string | null;
};

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

function llmBannerMessage(diag: LLMDiagnostic): string {
  if (diag.status === "ok") return "";
  if (diag.status === "mock") return "Gemini: no API key configured. Replies will use fallback behavior.";
  if (diag.errorType === "MODEL_NOT_FOUND") return `Gemini error: model "${diag.model}" not found.`;
  if (diag.errorType === "QUOTA_EXCEEDED") return "Gemini error: quota exceeded.";
  if (diag.errorType === "AUTH_ERROR") return "Gemini error: API key rejected.";
  if (diag.errorType === "NETWORK_ERROR") return "Gemini error: network unreachable.";
  return diag.errorMessageSafe ?? "Gemini error. Check server logs.";
}

const BANNER_DISMISS_KEY = "group-copilot:diag-banner-dismissed";
const PRIVACY_DISCLAIMER_KEY = "group-copilot:privacy-disclaimer-seen";

export default function RoomChatPage() {
  const params = useParams<{ code: string }>();
  const code = params.code;
  const router = useRouter();
  const searchParams = useSearchParams();
  const threadParam = searchParams.get("thread");
  const { data: session, status } = useSession();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { room, setRoom, messages, setMessages, addMessage } = useRoomStore();

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [mobilePanelOpen, setMobilePanelOpen] = useState(false);
  const [desktopPanelOpen, setDesktopPanelOpen] = useState(false);
  const [dismissedModel, setDismissedModel] = useState<string | null>(null);
  const [showPrivacyDisclaimer, setShowPrivacyDisclaimer] = useState(false);
  const openDesktopPanel = useCallback(() => setDesktopPanelOpen(true), []);

  useEffect(() => {
    setDismissedModel(window.localStorage.getItem(BANNER_DISMISS_KEY));
    const hasSeenDisclaimer = window.localStorage.getItem(PRIVACY_DISCLAIMER_KEY) === "1";
    setShowPrivacyDisclaimer(!hasSeenDisclaimer);
  }, []);

  const diagQuery = useQuery<LLMDiagnostic>({
    queryKey: ["llm-diag"],
    queryFn: async () => {
      const res = await fetch("/api/diagnostics/llm");
      if (!res.ok) throw new Error("Diagnostics failed");
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  const diag = diagQuery.data;
  const diagBannerKey = diag ? `${diag.status}-${diag.errorType}` : null;
  const showBanner =
    diag && diag.status !== "ok" && dismissedModel !== `${diag.status}-${diag.errorType}`;

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

  const threadsQuery = useQuery({
    queryKey: ["threads", code],
    queryFn: async () => {
      const res = await fetch(`/api/rooms/${code}/threads`);
      if (!res.ok) throw new Error("Failed to load conversations");
      const data = await res.json();
      return (data.threads ?? []) as ConversationThread[];
    },
    enabled: status === "authenticated",
  });

  const threads = threadsQuery.data ?? [];

  const activeThreadId = useMemo(() => {
    if (threadParam && threads.some((thread) => thread.id === threadParam)) {
      return threadParam;
    }
    return threads[0]?.id ?? null;
  }, [threadParam, threads]);

  useEffect(() => {
    if (!activeThreadId || threadParam === activeThreadId) return;
    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.set("thread", activeThreadId);
    router.replace(`/room/${code}/chat?${nextParams.toString()}`);
  }, [activeThreadId, code, router, searchParams, threadParam]);

  useEffect(() => {
    setMessages([]);
  }, [activeThreadId, setMessages]);

  const messagesQuery = useQuery({
    queryKey: ["messages", code, activeThreadId],
    queryFn: async () => {
      const res = await fetch(
        `/api/rooms/${code}/messages?threadId=${encodeURIComponent(activeThreadId ?? "")}`
      );
      if (!res.ok) throw new Error("Failed to load messages");
      const data = await res.json();
      return data.messages as Message[];
    },
    enabled: status === "authenticated" && Boolean(activeThreadId),
  });

  useEffect(() => {
    if (!messagesQuery.data) return;
    setMessages(messagesQuery.data.map((m) => ({ ...m, timestamp: m.timestamp ?? m.createdAt })));
  }, [messagesQuery.data, setMessages]);

  const sendMutation = useMutation({
    mutationFn: async (content: string) => {
      if (!activeThreadId) {
        throw new Error("No active conversation selected.");
      }

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomCode: code, message: content, threadId: activeThreadId }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(
          typeof payload?.error === "string" ? payload.error : "Assistant error"
        );
      }
      return payload as { assistantMessage: Message; mockMode?: boolean };
    },
    onSuccess: (data) => {
      if (data.mockMode) queryClient.invalidateQueries({ queryKey: ["llm-diag"] });
      queryClient.invalidateQueries({ queryKey: ["messages", code, activeThreadId] });
      queryClient.invalidateQueries({ queryKey: ["threads", code] });
    },
    onError: (error) => {
      toast({
        title: "Assistant unavailable",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
      queryClient.invalidateQueries({ queryKey: ["llm-diag"] });
    },
  });

  const newConversationMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/rooms/${code}/threads`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(
          typeof payload?.error === "string" ? payload.error : "Unable to create conversation."
        );
      }
      return payload.thread as ConversationThread;
    },
    onSuccess: (thread) => {
      queryClient.cancelQueries({ queryKey: ["messages", code] });
      queryClient.setQueryData(["messages", code, thread.id], []);
      queryClient.setQueryData<ConversationThread[]>(["threads", code], (current) => {
        const currentList = current ?? [];
        if (currentList.some((existing) => existing.id === thread.id)) {
          return currentList;
        }
        return [thread, ...currentList];
      });
      const nextParams = new URLSearchParams(searchParams.toString());
      nextParams.set("thread", thread.id);
      router.replace(`/room/${code}/chat?${nextParams.toString()}`);
      queryClient.invalidateQueries({ queryKey: ["threads", code] });
    },
    onError: (error) => {
      toast({
        title: "Could not create conversation",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleSend = async (value: string) => {
    if (!value.trim()) {
      toast({ title: "Message is empty", description: "Write something before sending." });
      return;
    }
    if (!activeThreadId) {
      toast({ title: "No conversation selected", description: "Create or select a conversation first." });
      return;
    }
    if (showPrivacyDisclaimer) {
      dismissPrivacyDisclaimer();
    }
    const userMessage = createMessage("user", session?.user?.name ?? "You", value);
    addMessage({ ...userMessage, threadId: activeThreadId });
    await sendMutation.mutateAsync(value);
  };

  const switchThread = (threadId: string) => {
    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.set("thread", threadId);
    router.replace(`/room/${code}/chat?${nextParams.toString()}`);
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
        <p className="text-xs text-muted-foreground">Sign in to continue to this room chat.</p>
        <Button onClick={() => (window.location.href = "/")}>Go to Sign In</Button>
      </div>
    );
  }

  const dismissBanner = () => {
    if (!diagBannerKey) return;
    window.localStorage.setItem(BANNER_DISMISS_KEY, diagBannerKey);
    setDismissedModel(diagBannerKey);
  };

  const dismissPrivacyDisclaimer = () => {
    window.localStorage.setItem(PRIVACY_DISCLAIMER_KEY, "1");
    setShowPrivacyDisclaimer(false);
  };

  const listMessages = messages;

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
          {showBanner && diag ? (
            <div className="mx-auto mt-3 w-full max-w-5xl px-4">
              <div className="flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900/40 dark:bg-amber-900/20 dark:text-amber-300">
                <p>{llmBannerMessage(diag)}</p>
                <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={dismissBanner}>
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ) : (
            <div className="pt-3" />
          )}

          <div className="mx-auto flex min-h-0 w-full max-w-5xl flex-1 flex-col px-4">
            <section className="mb-3 rounded-xl border border-border/70 bg-card/70 p-3">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Conversations
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => newConversationMutation.mutate()}
                  disabled={newConversationMutation.isPending}
                >
                  <Plus className="h-4 w-4" />
                  New conversation
                </Button>
              </div>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {threads.length === 0 ? (
                  <p className="py-2 text-sm text-muted-foreground">No conversations yet.</p>
                ) : null}
                {threads.map((thread) => (
                  <button
                    key={thread.id}
                    type="button"
                    onClick={() => switchThread(thread.id)}
                    className={`min-w-[180px] rounded-lg border px-3 py-2 text-left text-sm transition ${
                      activeThreadId === thread.id
                        ? "border-primary/50 bg-primary/10"
                        : "border-border/70 bg-background hover:border-primary/30 hover:bg-accent/40"
                    }`}
                    title={thread.title}
                  >
                    <p className="truncate font-medium">{thread.title}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {new Date(thread.lastMessageAt).toLocaleString()}
                    </p>
                  </button>
                ))}
              </div>
            </section>

            {messagesQuery.isLoading && activeThreadId ? (
              <div className="flex min-h-0 flex-1 items-center justify-center">
                <p className="text-sm text-muted-foreground">Loading conversation...</p>
              </div>
            ) : listMessages.length === 0 ? (
              <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4">
                <EmptyState
                  title="Start a new conversation"
                  description="Ask Plan Copilot for planning guidance, risk checks, or neutral mediation help."
                />
              </div>
            ) : (
              <MessageList
                messages={listMessages}
                isAssistantThinking={sendMutation.isPending}
                thinkingLabel="Plan Copilot is thinking..."
              />
            )}

            {showPrivacyDisclaimer ? (
              <div className="mb-2 rounded-xl border border-sky-200/70 bg-gradient-to-r from-sky-50/90 via-blue-50/80 to-cyan-50/70 px-3.5 py-2.5 shadow-sm dark:border-sky-800/60 dark:from-sky-950/35 dark:via-blue-950/30 dark:to-cyan-950/20">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-sky-300/70 bg-sky-100/90 text-sky-700 dark:border-sky-700/60 dark:bg-sky-900/50 dark:text-sky-300">
                    <ShieldAlert className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-sky-700 dark:text-sky-300">
                      Privacy reminder
                    </p>
                    <p className="mt-0.5 text-xs leading-relaxed text-slate-700 dark:text-slate-200">
                      Please avoid sharing personal or sensitive information in chat, such as phone numbers, SSN, addresses, passwords, or financial account details.
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0 text-slate-500 hover:bg-sky-100/70 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-sky-900/40 dark:hover:text-white"
                    onClick={dismissPrivacyDisclaimer}
                    aria-label="Dismiss privacy notice"
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ) : null}

            <Composer
              key={activeThreadId ?? "no-thread"}
              onSend={handleSend}
              disabled={sendMutation.isPending || newConversationMutation.isPending || !activeThreadId}
              showPresets={listMessages.length === 0}
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
