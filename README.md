# Group Copilot

Group Copilot is a shared chatbot interface for teams. It helps groups brainstorm, ask the right questions, suggest and create tasks, schedule meetings, and handle conflict constructively.

Built for the BU Civic Hackathon (Education Track).

## Why this exists

Group projects often fail due to unclear responsibilities, uneven workload, missed deadlines, and unresolved conflict. Group Copilot turns messy coordination into a guided flow:
- Kickoff clarity. Define goal, scope, and roles.
- Action extraction. Convert chat into tickets and next steps.
- Scheduling. Set meetings fast and reduce back-and-forth.
- Healthier teamwork. Provide conflict management guidance and scripts.

## MVP Scope

### 1) Shared chatbot interface (client-side)
- One shared chat room per group
- Messages are visible to all members
- Lightweight session state for the hackathon demo

### 2) Assistant asks questions and brainstorms
The assistant leads the conversation instead of only answering. Examples:
- “What is your goal for today’s meeting?”
- “List 3 options. Then we compare tradeoffs.”
- “What is blocked and what is the smallest next step?”

### 3) Ticket assignment suggestions and creation
- The bot suggests tickets with:
  - title
  - description
  - suggested owner (based on what members say)
  - priority and estimated effort
- Users can accept, edit, or ignore suggestions
- With tool connections enabled, the bot can also create tasks in external tools (example: Notion)

### 4) Conflict management guide for training
A short, practical guide the assistant uses when conflict appears:
- common conflict patterns
- de-escalation scripts
- a step-by-step resolution process
- when to ask for TA or instructor help

### 5) General-purpose audience
Not tied to a single course. Works for:
- class group assignments
- hackathon teams
- clubs and student org projects

## Tooling via MCP Server

This project uses an MCP (Model Context Protocol) server to connect the assistant with external tools.

Planned tool integrations:
- **Notion**: create and update tasks on a Notion board
- **Google Calendar**: schedule meetings and propose time slots
- **Extensible**: add more tools later (Slack, Google Drive, Jira, Trello, email, etc.)

High level flow:
1. Chat produces structured intents (create_task, schedule_meeting, etc.)
2. Assistant calls MCP tool endpoints
3. Results are summarized back into the chat and optionally synced into a simple local UI view

Notes:
- For the hackathon, we can demo tool calls with a real integration or a mocked connector if credentials are not available.
- We keep user control. The assistant suggests actions first and executes only when approved.

## Non-goals for MVP
- Complex multi-tenant permissions and enterprise auth
- Automatic grading or surveillance
- Aggressive sentiment monitoring
- Full conflict mediation. MVP provides guidance and scripts.

## Tech Stack (suggested)
- Frontend: React + TypeScript (Vite), TailwindCSS, shadcn/ui
- LLM API: OpenAI (or any hackathon-approved model)
- MCP Server: tool connectors (Notion, Google Calendar, and more)
- Storage (MVP): localStorage
- Optional later: Supabase or Firebase for persistence and auth

## Getting Started

### Prerequisites
- Node.js 18+
- MCP server running (local or hosted)
- Tool credentials if using live integrations (Notion, Google Calendar)

### Install
```bash
npm install