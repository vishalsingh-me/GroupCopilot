"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { useSession, signIn } from "next-auth/react";
import { X } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Sidebar from "@/components/layout/Sidebar";
import Topbar from "@/components/layout/Topbar";
import RightPanel from "@/components/layout/RightPanel";
import MessageList from "@/components/chat/MessageList";
import Composer from "@/components/chat/Composer";
import ModeChips from "@/components/chat/ModeChips";
import EmptyState from "@/components/common/EmptyState";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/common/use-toast";
import { useRoomStore, createSystemMessage } from "@/lib/store";
import { createMessage } from "@/lib/chat";
import { normalizeMode } from "@/lib/types";
import type { Mode, Message, MeetingProposal } from "@/lib/types";

const modeDescriptions: Record<Mode, string> = {
  brainstorm: "I will ask 3-5 questions, summarize options, and help you decide.",
  clarify: "I will gather constraints before proposing actions.",
  tickets: "I will propose ticket suggestions for acceptance.",
  schedule: "I will propose meeting slots and ask clarifying questions.",
  conflict: "I will use the conflict guide to propose scripts and steps."
};

function PanelParamReader({
  onPanelDetected
}: {
  onPanelDetected?: () => void;
}) {
  const searchParams = useSearchParams();
  const { setPanelTab } = useRoomStore();
  useEffect(() => {
    const panel = searchParams.get("panel");
    if (panel === "tickets" || panel === "meetings" || panel === "guide" || panel === "activity") {
      setPanelTab(panel as any);
      onPanelDetected?.();
    }
  }, [searchParams, setPanelTab, onPanelDetected]);
  return null;
}

const MOCK_BANNER_DISMISS_KEY = "group-copilot:mock-banner-dismissed";

export default function RoomPage() {
  const params = useParams<{ code: string }>();
  const code = params.code;
  const { data: session, status } = useSession();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const {
    room,
    setRoom,
    messages,
    setMessages,
    addMessage,
    setMode,
    mode,
    setMeetingSlots
  } = useRoomStore();
  const currentMode = normalizeMode(mode);

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [mobilePanelOpen, setMobilePanelOpen] = useState(false);
  const [desktopPanelOpen, setDesktopPanelOpen] = useState(false);
  const [dismissedBannerType, setDismissedBannerType] = useState<string | null>(null);
  const [mockStatus, setMockStatus] = useState({
    mockLLM: false,
    mockTools: false
  });

  const mockBannerType = useMemo(() => {
    if (mockStatus.mockLLM && mockStatus.mockTools) return "both";
    if (mockStatus.mockLLM) return "llm";
    if (mockStatus.mockTools) return "tools";
    return "none";
  }, [mockStatus]);

  const mockBannerMessage = useMemo(() => {
    if (mockBannerType === "llm") return "LLM in mock mode (Gemini unavailable).";
    if (mockBannerType === "tools") return "Tools in mock mode (MCP unavailable).";
    if (mockBannerType === "both") return "LLM + tools in mock mode.";
    return "";
  }, [mockBannerType]);

  const showMockBanner = mockBannerType !== "none" && dismissedBannerType !== mockBannerType;

  useEffect(() => {
    const dismissed = window.localStorage.getItem(MOCK_BANNER_DISMISS_KEY);
    setDismissedBannerType(dismissed);

    fetch("/api/status")
      .then((res) => res.json())
      .then((data) =>
        setMockStatus({
          mockLLM: Boolean(data.mockLLM),
          mockTools: Boolean(data.mockTools)
        })
      )
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (status === "unauthenticated") {
      signIn("google", { callbackUrl: `/room/${code}` });
    }
  }, [status, code]);

  useEffect(() => {
    const normalized = normalizeMode(mode);
    if (normalized !== mode) {
      setMode(normalized);
    }
  }, [mode, setMode]);

  const roomQuery = useQuery({
    queryKey: ["room", code],
    queryFn: async () => {
      const res = await fetch(`/api/rooms/${code}`);
      if (!res.ok) throw new Error("Failed to load room");
      const data = await res.json();
      setRoom(data.room);
      return data.room;
    },
    enabled: !!session
  });

  const messagesQuery = useQuery({
    queryKey: ["messages", code],
    queryFn: async () => {
      const res = await fetch(`/api/rooms/${code}/messages`);
      if (!res.ok) throw new Error("Failed to load messages");
      const data = await res.json();
      return data.messages as Message[];
    },
    enabled: !!session
  });

  useEffect(() => {
    if (messagesQuery.data) {
      setMessages(messagesQuery.data.map((m) => ({ ...m, timestamp: m.timestamp ?? m.createdAt })));
    }
  }, [messagesQuery.data]);

  const sendMutation = useMutation({
    mutationFn: async (content: string) => {
      const saveRes = await fetch(`/api/rooms/${code}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, mode: currentMode })
      });
      if (!saveRes.ok) {
        throw new Error("Failed to save message");
      }
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomCode: code, message: content, mode: currentMode })
      });
      if (!res.ok) throw new Error("Assistant error");
      return res.json() as Promise<{
        assistantMessage: Message;
        artifacts?: { meetingProposals?: MeetingProposal[]; tickets?: any[] };
        mockMode?: boolean;
      }>;
    },
    onSuccess: async (data) => {
      setMockStatus((previous) => ({
        ...previous,
        mockLLM: previous.mockLLM || Boolean(data.mockMode)
      }));
      await queryClient.invalidateQueries({ queryKey: ["messages", code] });
      if (data.artifacts?.meetingProposals) {
        setMeetingSlots(
          data.artifacts.meetingProposals.map((slot, idx) => ({
            ...slot,
            id: slot.start ?? String(idx)
          }))
        );
      }
    },
    onError: () => {
      toast({ title: "Assistant unavailable", description: "Showing mock response." });
      setMockStatus((previous) => ({ ...previous, mockLLM: true }));
    }
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

  if (!session) {
    return null;
  }

  const dismissMockBanner = () => {
    if (mockBannerType === "none") return;
    window.localStorage.setItem(MOCK_BANNER_DISMISS_KEY, mockBannerType);
    setDismissedBannerType(mockBannerType);
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
          {showMockBanner ? (
            <div className="mx-auto mt-3 w-full max-w-4xl px-4">
              <div className="flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                <p>{mockBannerMessage}</p>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={dismissMockBanner}>
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ) : (
            <div className="pt-3" />
          )}
          <div className="mx-auto flex min-h-0 w-full max-w-4xl flex-1 flex-col px-4">
            {listMessages.length === 0 ? (
              <div className="flex min-h-0 flex-1 items-center">
                <EmptyState
                  title="Start by telling the assistant your goal"
                  description="Try Brainstorm mode if you want guided questions."
                  actionLabel="Try Brainstorm mode"
                  onAction={() => handleModeChange("brainstorm", "Brainstorm")}
                />
              </div>
            ) : (
              <MessageList
                messages={listMessages}
                isAssistantThinking={sendMutation.isPending}
                thinkingLabel={assistantActivityLabel}
              />
            )}

            <div className="border-t border-border/60 pt-3">
              <ModeChips mode={currentMode} onChange={handleModeChange} />
              <p className="mt-2 text-xs text-muted-foreground">{modeDescriptions[currentMode]}</p>
            </div>
            <Composer
              onSend={handleSend}
              disabled={sendMutation.isPending}
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
