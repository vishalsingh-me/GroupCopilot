"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { useSession, signIn } from "next-auth/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Sidebar from "@/components/layout/Sidebar";
import Topbar from "@/components/layout/Topbar";
import RightPanel from "@/components/layout/RightPanel";
import MessageList from "@/components/chat/MessageList";
import Composer from "@/components/chat/Composer";
import ModeChips from "@/components/chat/ModeChips";
import EmptyState from "@/components/common/EmptyState";
import ToolStatus from "@/components/integrations/ToolStatus";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
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

function PanelParamReader() {
  const searchParams = useSearchParams();
  const { setPanelTab } = useRoomStore();
  useEffect(() => {
    const panel = searchParams.get("panel");
    if (panel === "tickets" || panel === "meetings" || panel === "guide" || panel === "activity") {
      setPanelTab(panel as any);
    }
  }, [searchParams, setPanelTab]);
  return null;
}

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
    setMeetingSlots,
    toolActions
  } = useRoomStore();
  const currentMode = normalizeMode(mode);

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [mockBanner, setMockBanner] = useState(false);

  useEffect(() => {
    fetch("/api/status")
      .then((res) => res.json())
      .then((data) => setMockBanner(data.mockLLM || data.mockTools))
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
    onSuccess: (data) => {
      setMockBanner(Boolean(data.mockMode));
      queryClient.invalidateQueries({ queryKey: ["messages", code] });
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
      setMockBanner(true);
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

  return (
    <div className="flex h-screen flex-col bg-background">
      <Suspense fallback={null}><PanelParamReader /></Suspense>
      <Topbar onOpenSidebar={() => setSidebarOpen(true)} onOpenPanel={() => setPanelOpen(true)} />
      {mockBanner ? (
        <div className="bg-amber-100 px-4 py-2 text-sm text-amber-800">
          Mock mode: GEMINI_API_KEY or MCP_SERVER_URL missing. Responses and tool calls are simulated.
        </div>
      ) : null}
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex flex-1 flex-col gap-4 overflow-hidden p-4 lg:p-6">
          <div className="rounded-2xl border border-border bg-card/70 p-4 shadow-soft">
            <div className="flex flex-col gap-2">
              <ModeChips mode={currentMode} onChange={handleModeChange} />
              <p className="text-sm text-muted-foreground">{modeDescriptions[currentMode]}</p>
            </div>
          </div>

          {listMessages.length === 0 ? (
            <EmptyState
              title="Start by telling the assistant your goal"
              description="Try Brainstorm mode if you want guided questions."
              actionLabel="Try Brainstorm mode"
              onAction={() => handleModeChange("brainstorm", "Brainstorm")}
            />
          ) : (
            <MessageList messages={listMessages} />
          )}

          <Composer onSend={handleSend} disabled={sendMutation.isPending} />
          <ToolStatus actions={toolActions} />
        </main>
        <RightPanel />
      </div>

      <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
        <SheetTrigger asChild>
          <div />
        </SheetTrigger>
        <SheetContent side="left" className="p-0">
          <Sidebar className="flex w-full" />
        </SheetContent>
      </Sheet>

      <Sheet open={panelOpen} onOpenChange={setPanelOpen}>
        <SheetTrigger asChild>
          <div />
        </SheetTrigger>
        <SheetContent side="right" className="p-0">
          <div className="h-full">
            <RightPanel className="flex w-full" />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
