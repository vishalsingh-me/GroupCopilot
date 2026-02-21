"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import Sidebar from "@/components/layout/Sidebar";
import Topbar from "@/components/layout/Topbar";
import RightPanel from "@/components/layout/RightPanel";
import MessageList from "@/components/chat/MessageList";
import Composer from "@/components/chat/Composer";
import ModeChips from "@/components/chat/ModeChips";
import EmptyState from "@/components/common/EmptyState";
import ToolStatus from "@/components/integrations/ToolStatus";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/common/use-toast";
import { useRoomStore, createSystemMessage } from "@/lib/store";
import { createMessage, streamMessage } from "@/lib/chat";
import type { Mode } from "@/lib/types";

const modeDescriptions: Record<Mode, string> = {
  brainstorm: "I will ask 3-5 questions, summarize options, and help you decide.",
  planning: "I will turn the conversation into ticket suggestions.",
  conflict: "I will use the conflict guide to propose scripts and steps.",
  general: "I will ask clarifying questions and move the plan forward."
};

function PanelParamReader() {
  const searchParams = useSearchParams();
  const { setPanelTab } = useRoomStore();
  useEffect(() => {
    const panel = searchParams.get("panel");
    if (panel === "tickets" || panel === "meetings" || panel === "guide") {
      setPanelTab(panel as "tickets" | "meetings" | "guide");
    }
  }, [searchParams, setPanelTab]);
  return null;
}

export default function RoomPage() {
  const router = useRouter();
  const { toast } = useToast();
  const {
    profile,
    room,
    messages,
    mode,
    setMode,
    addMessage,
    updateMessage,
    addToolAction,
    toolActions
  } = useRoomStore();

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);

  useEffect(() => {
    if (!profile || !room) {
      router.push("/");
    }
  }, [profile, room, router]);

  useEffect(() => {
    if (messages.length === 0) {
      addMessage(
        createSystemMessage(
          "Kickoff suggestion: Tell me your project goal and any constraints you have.",
          mode
        )
      );
    }
  }, [messages.length, addMessage, mode]);

  const mutation = useMutation({
    mutationFn: async (prompt: string) => {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, mode })
      });
      if (!response.ok) {
        throw new Error("Failed to fetch response");
      }
      return response.json() as Promise<{ content: string; mock: boolean }>;
    }
  });

  const handleSend = async (value: string) => {
    if (!value.trim()) {
      toast({ title: "Message is empty", description: "Write something before sending." });
      return;
    }
    const userMessage = createMessage("user", profile?.name ?? "You", value, mode);
    addMessage(userMessage);

    const assistantMessage = createMessage("assistant", "Group Copilot", "", mode);
    addMessage(assistantMessage);

    try {
      const response = await mutation.mutateAsync(value);
      if (response.mock) {
        addMessage(createSystemMessage("Mock mode enabled: add GEMINI_API_KEY to use live responses.", mode));
        addToolAction({
          id: Math.random().toString(36).slice(2, 9),
          tool: "notion",
          status: "success",
          summary: "Mock mode enabled - tool calls are simulated",
          createdAt: new Date().toISOString()
        });
      }
      streamMessage(
        response.content,
        (partial) => updateMessage(assistantMessage.id, partial),
        () => undefined
      );
    } catch (error) {
      updateMessage(assistantMessage.id, "Sorry, I couldn't reach the assistant. Mock mode enabled.");
      toast({ title: "Assistant unavailable", description: "Mock response shown." });
    }
  };

  const handleModeChange = (nextMode: Mode, label: string) => {
    setMode(nextMode);
    addMessage(createSystemMessage(`Mode switched: ${label}. ${modeDescriptions[nextMode]}`, nextMode));
  };

  const lastAssistant = useMemo(() => {
    const reversed = [...messages].reverse();
    return reversed.find((message) => message.role === "assistant");
  }, [messages]);

  return (
    <div className="flex h-screen flex-col bg-background">
      <Suspense fallback={null}><PanelParamReader /></Suspense>
      <Topbar onOpenSidebar={() => setSidebarOpen(true)} onOpenPanel={() => setPanelOpen(true)} />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex flex-1 flex-col gap-4 overflow-hidden p-4 lg:p-6">
          <div className="rounded-2xl border border-border bg-card/70 p-4 shadow-soft">
            <div className="flex flex-col gap-2">
              <ModeChips mode={mode} onChange={handleModeChange} />
              <p className="text-sm text-muted-foreground">{modeDescriptions[mode]}</p>
            </div>
          </div>

          {messages.length === 0 ? (
            <EmptyState
              title="Start by telling the assistant your goal"
              description="Try Brainstorm mode if you want guided questions."
              actionLabel="Try Brainstorm mode"
              onAction={() => handleModeChange("brainstorm", "Brainstorm")}
            />
          ) : (
            <MessageList messages={messages} />
          )}

          {mode === "brainstorm" && lastAssistant ? (
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => handleSend("Continue")}>Continue</Button>
              <Button variant="outline" onClick={() => handleSend("Generate a summary of options")}
              >
                Generate summary
              </Button>
            </div>
          ) : null}

          <Composer onSend={handleSend} disabled={mutation.isPending} />
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
