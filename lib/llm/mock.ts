import type { Mode, TicketPriority, TicketEffort } from "@prisma/client";

type GenerateArgs = {
  mode: Mode;
  message: string;
};

export type TicketSuggestion = {
  title: string;
  description: string;
  suggestedOwnerName?: string;
  priority: TicketPriority;
  effort: TicketEffort;
  status: "todo" | "doing" | "done";
};

export type MeetingProposal = {
  title: string;
  start: string;
  end: string;
  timezone?: string;
};

export type GenerateResult = {
  text: string;
  artifacts?: {
    tickets?: TicketSuggestion[];
    meetingProposals?: MeetingProposal[];
  };
  mockMode: boolean;
};

export async function generateMockReply({ mode, message }: GenerateArgs): Promise<GenerateResult> {
  switch (mode) {
    case "brainstorm":
      return {
        text: `Let's brainstorm: 1) What's the success metric? 2) Who's involved? 3) Constraints? You said: "${message}".`,
        mockMode: true
      };
    case "clarify":
      return {
        text: `Clarifying questions: deadline? scope? blockers? current status?`,
        mockMode: true
      };
    case "tickets":
      return {
        text: "Here are ticket suggestions.",
        artifacts: {
          tickets: [
            {
              title: "Define MVP scope",
              description: "List the 3 must-have user journeys and non-goals.",
              suggestedOwnerName: "You",
              priority: "med",
              effort: "S",
              status: "todo"
            },
            {
              title: "Set up deployment",
              description: "Create Vercel project and configure env vars.",
              suggestedOwnerName: "Teammate",
              priority: "high",
              effort: "M",
              status: "todo"
            }
          ]
        },
        mockMode: true
      };
    case "schedule":
      return {
        text: "Proposed meeting slots below.",
        artifacts: {
          meetingProposals: [
            {
              title: "Sprint sync",
              start: new Date(Date.now() + 3600_000).toISOString(),
              end: new Date(Date.now() + 5400_000).toISOString(),
              timezone: "UTC"
            }
          ]
        },
        mockMode: true
      };
    case "conflict":
      return {
        text: "Acknowledging tension. Let's list needs and pick a script from the guide.",
        mockMode: true
      };
    default:
      return { text: `Thanks for sharing: ${message}`, mockMode: true };
  }
}
