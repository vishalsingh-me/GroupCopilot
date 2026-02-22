import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Message, Room } from "@/lib/types";

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
  panelTab: PanelTab;
  setRoom: (room?: Room) => void;
  setMessages: (messages: Message[]) => void;
  addMessage: (message: Message) => void;
  updateMessage: (id: string, content: string) => void;
  setPanelTab: (tab: PanelTab) => void;
  resetState: () => void;
};

export const useRoomStore = create<RoomState>()(
  persist(
    (set, get) => ({
      room: undefined,
      messages: [],
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
      setPanelTab: (panelTab) =>
        set((state) => {
          const nextPanelTab = normalizePanelTab(panelTab);
          return state.panelTab === nextPanelTab ? state : { panelTab: nextPanelTab };
        }),
      resetState: () => set({ room: undefined, messages: [] })
    }),
    {
      name: "group-copilot-store",
      merge: (persistedState, currentState) => {
        const persisted = (persistedState as Partial<RoomState>) ?? {};
        return {
          ...currentState,
          ...persisted,
          panelTab: normalizePanelTab(persisted.panelTab, currentState.panelTab)
        };
      },
      partialize: (state) => ({
        room: state.room,
        messages: state.messages,
        panelTab: state.panelTab
      })
    }
  )
);
