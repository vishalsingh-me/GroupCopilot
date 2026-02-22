import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Message, Mode, Room } from "@/lib/types";
import { normalizeMode } from "@/lib/types";
import { nanoid } from "@/lib/uuid";

type PanelTab = "plan" | "trello" | "guide" | "activity";
const PANEL_TABS: readonly PanelTab[] = ["plan", "trello", "guide", "activity"] as const;

function normalizePanelTab(value: unknown, fallback: PanelTab = "plan"): PanelTab {
  return typeof value === "string" && PANEL_TABS.includes(value as PanelTab)
    ? (value as PanelTab)
    : fallback;
}

type RoomState = {
  room?: Room;
  messages: Message[];
  mode: Mode;
  panelTab: PanelTab;
  setRoom: (room?: Room) => void;
  setMessages: (messages: Message[]) => void;
  addMessage: (message: Message) => void;
  updateMessage: (id: string, content: string) => void;
  setMode: (mode: Mode) => void;
  setPanelTab: (tab: PanelTab) => void;
  resetState: () => void;
};

export const useRoomStore = create<RoomState>()(
  persist(
    (set, get) => ({
      room: undefined,
      messages: [],
      mode: "brainstorm",
      panelTab: "plan",
      setRoom: (room) => set({ room }),
      setMessages: (messages) => set({ messages }),
      addMessage: (message) => set({ messages: [...get().messages, message] }),
      updateMessage: (id, content) =>
        set({
          messages: get().messages.map((message) =>
            message.id === id ? { ...message, content } : message
          )
        }),
      setMode: (mode) => set({ mode: normalizeMode(mode) }),
      setPanelTab: (panelTab) => set({ panelTab: normalizePanelTab(panelTab) }),
      resetState: () => set({ room: undefined, messages: [] })
    }),
    {
      name: "group-copilot-store",
      merge: (persistedState, currentState) => {
        const persisted = (persistedState as Partial<RoomState>) ?? {};
        return {
          ...currentState,
          ...persisted,
          mode: normalizeMode(persisted.mode, currentState.mode),
          panelTab: normalizePanelTab(persisted.panelTab, currentState.panelTab)
        };
      },
      partialize: (state) => ({
        room: state.room,
        messages: state.messages,
        mode: state.mode,
        panelTab: state.panelTab
      })
    }
  )
);

export function createSystemMessage(content: string, mode?: Mode): Message {
  const now = new Date().toISOString();
  return {
    id: nanoid(),
    role: "system",
    sender: "System",
    content,
    mode: mode ?? "brainstorm",
    createdAt: now,
    timestamp: now
  };
}
