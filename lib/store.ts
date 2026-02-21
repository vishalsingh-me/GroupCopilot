import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  Message,
  Mode,
  Profile,
  Room,
  Ticket,
  MeetingSlot,
  ToolAction,
  KnowledgeItem
} from "@/lib/types";
import { nanoid } from "@/lib/uuid";

type PanelTab = "tickets" | "meetings" | "guide";

type SettingsState = {
  modelProvider: "gemini" | "openai" | "local";
  apiKey?: string;
  mcpServerUrl?: string;
  requireToolConfirmation: boolean;
  devModeStoreKeys: boolean;
};

type RoomState = {
  profile?: Profile;
  room?: Room;
  messages: Message[];
  tickets: Ticket[];
  meetingSlots: MeetingSlot[];
  mode: Mode;
  panelTab: PanelTab;
  toolActions: ToolAction[];
  knowledgeItems: KnowledgeItem[];
  settings: SettingsState;
  setProfile: (profile?: Profile) => void;
  setRoom: (room?: Room) => void;
  addMessage: (message: Message) => void;
  updateMessage: (id: string, content: string) => void;
  setMode: (mode: Mode) => void;
  setPanelTab: (tab: PanelTab) => void;
  setTickets: (tickets: Ticket[]) => void;
  updateTicket: (ticket: Ticket) => void;
  setMeetingSlots: (slots: MeetingSlot[]) => void;
  addToolAction: (action: ToolAction) => void;
  updateToolAction: (action: ToolAction) => void;
  setKnowledgeItems: (items: KnowledgeItem[]) => void;
  setSettings: (settings: Partial<SettingsState>) => void;
  resetProfile: () => void;
};

const defaultSettings: SettingsState = {
  modelProvider: "gemini",
  requireToolConfirmation: true,
  devModeStoreKeys: false
};

export const useRoomStore = create<RoomState>()(
  persist(
    (set, get) => ({
      profile: undefined,
      room: undefined,
      messages: [],
      tickets: [],
      meetingSlots: [],
      mode: "general",
      panelTab: "tickets",
      toolActions: [],
      knowledgeItems: [],
      settings: defaultSettings,
      setProfile: (profile) => set({ profile }),
      setRoom: (room) => set({ room }),
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
      setKnowledgeItems: (knowledgeItems) => set({ knowledgeItems }),
      setSettings: (settings) => set({ settings: { ...get().settings, ...settings } }),
      resetProfile: () => set({ profile: undefined, room: undefined, messages: [] })
    }),
    {
      name: "group-copilot-store",
      partialize: (state) => ({
        profile: state.profile,
        room: state.room,
        messages: state.messages,
        tickets: state.tickets,
        meetingSlots: state.meetingSlots,
        mode: state.mode,
        panelTab: state.panelTab,
        toolActions: state.toolActions,
        knowledgeItems: state.knowledgeItems,
        settings: {
          ...state.settings,
          apiKey: state.settings.devModeStoreKeys ? state.settings.apiKey : undefined
        }
      })
    }
  )
);

export function createSystemMessage(content: string, mode?: Mode): Message {
  return {
    id: nanoid(),
    role: "system",
    sender: "System",
    content,
    timestamp: new Date().toISOString(),
    mode
  };
}
