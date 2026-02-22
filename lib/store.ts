import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Message, Mode, Room, Ticket, ToolAction, MeetingSlot } from "@/lib/types";
import { nanoid } from "@/lib/uuid";

type PanelTab = "tickets" | "meetings" | "guide" | "activity";

type RoomState = {
  room?: Room;
  messages: Message[];
  tickets: Ticket[];
  meetingSlots: MeetingSlot[];
  mode: Mode;
  panelTab: PanelTab;
  toolActions: ToolAction[];
  settings: {
    requireToolConfirmation: boolean;
  };
  setRoom: (room?: Room) => void;
  setMessages: (messages: Message[]) => void;
  addMessage: (message: Message) => void;
  updateMessage: (id: string, content: string) => void;
  setMode: (mode: Mode) => void;
  setPanelTab: (tab: PanelTab) => void;
  setTickets: (tickets: Ticket[]) => void;
  updateTicket: (ticket: Ticket) => void;
  setMeetingSlots: (slots: MeetingSlot[]) => void;
  addToolAction: (action: ToolAction) => void;
  updateToolAction: (action: ToolAction) => void;
  setToolActions: (actions: ToolAction[]) => void;
  setSettings: (settings: Partial<RoomState["settings"]>) => void;
  resetState: () => void;
};

export const useRoomStore = create<RoomState>()(
  persist(
    (set, get) => ({
      room: undefined,
      messages: [],
      tickets: [],
      meetingSlots: [],
      mode: "brainstorm",
      panelTab: "tickets",
      toolActions: [],
      settings: {
        requireToolConfirmation: true
      },
      setRoom: (room) => set({ room }),
      setMessages: (messages) => set({ messages }),
      addMessage: (message) => set({ messages: [...get().messages, message] }),
      updateMessage: (id, content) =>
        set({
          messages: get().messages.map((message) =>
            message.id === id ? { ...message, content } : message
          )
        }),
      setMode: (mode) => set({ mode }),
      setPanelTab: (panelTab) => set({ panelTab }),
      setTickets: (tickets) => set({ tickets }),
      updateTicket: (ticket) =>
        set({
          tickets: get().tickets.map((item) => (item.id === ticket.id ? ticket : item))
        }),
      setMeetingSlots: (meetingSlots) => set({ meetingSlots }),
      addToolAction: (action) => set({ toolActions: [action, ...get().toolActions] }),
      updateToolAction: (action) =>
        set({
          toolActions: get().toolActions.map((item) => (item.id === action.id ? action : item))
        }),
      setToolActions: (actions) => set({ toolActions: actions }),
      setSettings: (settings) => set({ settings: { ...get().settings, ...settings } }),
      resetState: () => set({ room: undefined, messages: [], tickets: [], toolActions: [] })
    }),
    {
      name: "group-copilot-store",
      partialize: (state) => ({
        room: state.room,
        messages: state.messages,
        tickets: state.tickets,
        meetingSlots: state.meetingSlots,
        mode: state.mode,
        panelTab: state.panelTab,
        toolActions: state.toolActions,
        settings: state.settings
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
