"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { X, CalendarClock } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Sidebar from "@/components/layout/Sidebar";
import Topbar from "@/components/layout/Topbar";
import RightPanel from "@/components/layout/RightPanel";
import MessageList from "@/components/chat/MessageList";
import Composer from "@/components/chat/Composer";
import ModeChips from "@/components/chat/ModeChips";
import ApprovalGate from "@/components/chat/ApprovalGate";
import EmptyState from "@/components/common/EmptyState";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/common/use-toast";
import { useRoomStore, createSystemMessage } from "@/lib/store";
import { createMessage } from "@/lib/chat";
import { normalizeMode } from "@/lib/types";
import type { Mode, Message, ApprovalGateData } from "@/lib/types";

type LLMDiagnostic = {
  hasApiKey: boolean;
  model: string;
  status: "ok" | "mock" | "error";
  latencyMs: number | null;
  errorType: string | null;
  errorMessageSafe: string | null;
};

const modeDescriptions: Record<Mode, string> = {
  brainstorm: "I will ask 3-5 questions, summarize options, and help you decide.",
  clarify: "I will gather constraints before proposing actions.",
  tickets: "I will propose ticket suggestions for acceptance.",
  schedule: "I will propose meeting slots and ask clarifying questions.",
  conflict: "I will use the conflict guide to propose scripts and steps."
};

function PanelParamReader({ onPanelDetected }: { onPanelDetected?: () => void }) {
  const searchParams = useSearchParams();
  const { setPanelTab } = useRoomStore();
  useEffect(() => {
    const panel = searchParams.get("panel");
    if (panel === "plan" || panel === "trello" || panel === "guide" || panel === "activity") {
      setPanelTab(panel);
      onPanelDetected?.();
    }
  }, [searchParams, setPanelTab, onPanelDetected]);
  return null;
}

function llmBannerMessage(diag: LLMDiagnostic): string {
  if (diag.status === "ok") return "";
  if (diag.status === "mock") return `Gemini: no API key — add GEMINI_API_KEY to .env.local and restart.`;
  // error
  if (diag.errorType === "MODEL_NOT_FOUND") return `Gemini error: model "${diag.model}" not found — set GEMINI_MODEL env var.`;
  if (diag.errorType === "QUOTA_EXCEEDED") return `Gemini error: quota exceeded — responses are mocked.`;
  if (diag.errorType === "AUTH_ERROR") return `Gemini error: API key rejected — check GEMINI_API_KEY value.`;
  if (diag.errorType === "NETWORK_ERROR") return `Gemini error: network unreachable — responses are mocked.`;
  return diag.errorMessageSafe ?? "Gemini error — check server logs.";
}

const BANNER_DISMISS_KEY = "group-copilot:diag-banner-dismissed";

export default function RoomPage() {
  const params = useParams<{ code: string }>();
  const code = params.code;
  const { data: session, status } = useSession();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { room, setRoom, messages, setMessages, addMessage, setMode, mode } = useRoomStore();
  const currentMode = normalizeMode(mode);

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [mobilePanelOpen, setMobilePanelOpen] = useState(false);
  const [desktopPanelOpen, setDesktopPanelOpen] = useState(false);
  const [dismissedModel, setDismissedModel] = useState<string | null>(null);

  // Load dismissed key from localStorage once on mount
  useEffect(() => {
    setDismissedModel(window.localStorage.getItem(BANNER_DISMISS_KEY));
  }, []);

  useEffect(() => {
    const normalized = normalizeMode(mode);
    if (normalized !== mode) setMode(normalized);
  }, [mode, setMode]);

  // Rich LLM diagnostic — fires once per page load (not per message)
  const diagQuery = useQuery<LLMDiagnostic>({
    queryKey: ["llm-diag"],
    queryFn: async () => {
      const res = await fetch("/api/diagnostics/llm");
      if (!res.ok) throw new Error("Diagnostics failed");
      return res.json();
    },
    staleTime: 5 * 60 * 1000, // re-check every 5 min
    retry: false,
  });

  const diag = diagQuery.data;
  const showBanner =
    diag && diag.status !== "ok" && dismissedModel !== `${diag.status}-${diag.errorType}`;

  const diagBannerKey = diag ? `${diag.status}-${diag.errorType}` : null;

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

  const messagesQuery = useQuery({
    queryKey: ["messages", code],
    queryFn: async () => {
      const res = await fetch(`/api/rooms/${code}/messages`);
      if (!res.ok) throw new Error("Failed to load messages");
      const data = await res.json();
      return data.messages as Message[];
    },
    enabled: status === "authenticated",
  });

  // Poll agent session + open approval gate every 5 s
  const sessionQuery = useQuery({
    queryKey: ["session", code],
    queryFn: async () => {
      const res = await fetch(`/api/rooms/${code}/session`);
      if (!res.ok) return null;
      return res.json() as Promise<{ session: { state: string } | null; approval: ApprovalGateData | null }>;
    },
    enabled: status === "authenticated" && !!room,
    refetchInterval: 5_000,
  });

  useEffect(() => {
    if (messagesQuery.data) {
      setMessages(messagesQuery.data.map((m) => ({ ...m, timestamp: m.timestamp ?? m.createdAt })));
    }
  }, [messagesQuery.data]);

  const sendMutation = useMutation({
    mutationFn: async (content: string) => {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomCode: code, message: content, mode: currentMode }),
      });
      if (!res.ok) throw new Error("Assistant error");
      return res.json() as Promise<{ assistantMessage: Message; mockMode?: boolean }>;
    },
    onSuccess: (data) => {
      if (data.mockMode) queryClient.invalidateQueries({ queryKey: ["llm-diag"] });
      queryClient.invalidateQueries({ queryKey: ["messages", code] });
      queryClient.invalidateQueries({ queryKey: ["session", code] });
    },
    onError: () => {
      toast({ title: "Assistant unavailable", description: "Using fallback responses." });
      queryClient.invalidateQueries({ queryKey: ["llm-diag"] });
    },
  });

  const handleSend = async (value: string) => {
    if (!value.trim()) {
      toast({ title: "Message is empty", description: "Write something before sending." });
      return;
    }
    const userMessage = createMessage("user", session?.user?.name ?? "You", value, currentMode);
    addMessage(userMessage);
    await sendMutation.mutateAsync(value);
  };

  const handleModeChange = (nextMode: Mode, label: string) => {
    setMode(nextMode);
    addMessage(createSystemMessage(`Mode switched: ${label}. ${modeDescriptions[nextMode]}`, nextMode));
  };

  // "Start Weekly Planning" — sends a kickoff message that advances IDLE → WEEKLY_KICKOFF
  const agentState = sessionQuery.data?.session?.state;
  const showKickoffButton = agentState === "IDLE" && messages.length === 0;

  const approval = sessionQuery.data?.approval ?? null;
  const listMessages = useMemo(() => messages, [messages]);
  const assistantActivityLabel = currentMode === "tickets" || currentMode === "schedule"
    ? "Assistant is writing..."
    : "Assistant is thinking...";

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

  return (
    <div className="flex h-screen flex-col bg-background">
      <Suspense fallback={null}>
        <PanelParamReader onPanelDetected={() => setDesktopPanelOpen(true)} />
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
            <div className="mx-auto mt-3 w-full max-w-4xl px-4">
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

          <div className="mx-auto flex min-h-0 w-full max-w-4xl flex-1 flex-col px-4">
            {listMessages.length === 0 ? (
              <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4">
                {showKickoffButton ? (
                  <div className="flex flex-col items-center gap-3 text-center">
                    <CalendarClock className="h-10 w-10 text-primary/60" />
                    <p className="text-sm font-medium">Ready to plan this week?</p>
                    <p className="text-xs text-muted-foreground max-w-xs">
                      The agent will draft a milestone skeleton, collect contributions, and publish tasks to Trello — all with your group's approval.
                    </p>
                    <Button
                      onClick={() => handleSend("Let's start the weekly planning session.")}
                      disabled={sendMutation.isPending}
                    >
                      <CalendarClock className="mr-2 h-4 w-4" />
                      Start Weekly Planning
                    </Button>
                  </div>
                ) : (
                  <EmptyState
                    title="Start by sending the assistant a message"
                    description="Use chat to coordinate work and unblock your group."
                    actionLabel="Switch to Clarify mode"
                    onAction={() => handleModeChange("clarify", "Clarify")}
                  />
                )}
              </div>
            ) : (
              <MessageList
                messages={listMessages}
                isAssistantThinking={sendMutation.isPending}
                thinkingLabel={assistantActivityLabel}
              />
            )}

            {approval && (
              <ApprovalGate
                approval={approval}
                onVote={async (vote, comment) => {
                  const response = await fetch(`/api/approvals/${approval.id}/vote`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ vote, comment }),
                  });
                  const payload = await response.json().catch(() => null);
                  if (!response.ok || payload?.ok === false) {
                    const message =
                      typeof payload?.message === "string"
                        ? payload.message
                        : typeof payload?.error === "string"
                          ? payload.error
                          : "Unable to record vote.";
                    toast({ title: "Vote failed", description: message, variant: "destructive" });
                    return;
                  }
                  queryClient.invalidateQueries({ queryKey: ["session", code] });
                  queryClient.invalidateQueries({ queryKey: ["messages", code] });
                }}
              />
            )}
            <div className="border-t border-border/60 pt-3">
              <ModeChips mode={currentMode} onChange={handleModeChange} />
              <p className="mt-2 text-xs text-muted-foreground">{modeDescriptions[currentMode]}</p>
            </div>
            <Composer
              onSend={handleSend}
              disabled={sendMutation.isPending || Boolean(approval)}
              showPresets={listMessages.length === 0}
            />
          </div>
        </main>
        {desktopPanelOpen ? (
          <RightPanel className="hidden lg:flex" onClose={() => setDesktopPanelOpen(false)} />
        ) : null}
      </div>

      <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
        <SheetTrigger asChild><div /></SheetTrigger>
        <SheetContent side="left" className="p-0">
          <Sidebar className="flex w-full" />
        </SheetContent>
      </Sheet>

      <Sheet open={mobilePanelOpen} onOpenChange={setMobilePanelOpen}>
        <SheetTrigger asChild><div /></SheetTrigger>
        <SheetContent side="right" className="p-0">
          <div className="h-full">
            <RightPanel className="flex h-full w-full" onClose={() => setMobilePanelOpen(false)} />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
