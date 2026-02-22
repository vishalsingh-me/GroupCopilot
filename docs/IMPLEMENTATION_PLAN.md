# Group Copilot – Implementation Plan

## Folder Structure (single repo)
- `app` — Next.js App Router pages and API routes.
- `components` — shared UI components (shadcn + custom).
- `lib` — client/server utilities (auth helpers, prisma, llm).
- `prisma` — Prisma schema and migrations.
- `docs` — product and engineering docs (this plan, conflict guide).
- `scripts` — dev/build helpers and seed scripts.
- Root configs: `package.json`, `tsconfig.json`, `.env.example`.

## API Contracts (Next.js route handlers)
- `POST /api/chat`  
  - Input: `{ roomCode: string, message: string, mode: "brainstorm" | "clarify" | "tickets" | "schedule" | "conflict" }`  
  - Output: `{ assistantMessage: string, artifacts?: object, mockMode: boolean }` (non-streaming MVP).
- `POST /api/artifacts/tickets`  
  - Input: `{ roomCode: string, contextMessages: ChatMessage[] }`  
  - Output: `{ tickets: TicketSuggestion[], followUpQuestions: string[], mockMode?: boolean }`.
- `POST /api/artifacts/schedule`  
  - Input: `{ roomCode: string, preferences: SchedulePreferences }`  
  - Output: `{ proposedSlots: TimeSlot[], questions: string[], mockMode?: boolean }`.
- MCP proxy (confirmation-gated):  
  - `POST /api/tools/notion/create-task` — Input: `{ roomCode, task }`; Output: `{ ok: boolean, result?: any, mockMode?: boolean }`.  
  - `POST /api/tools/calendar/create-event` — Input: `{ roomCode, event }`; Output similar.
- Persistence endpoints:  
  - Rooms: `POST /api/rooms` (create), `POST /api/rooms/join`, `GET /api/rooms/[code]`.  
  - Messages: `GET /api/rooms/[code]/messages`, `POST /api/rooms/[code]/messages`.  
  - Tickets: `GET /api/rooms/[code]/tickets`, `POST /api/rooms/[code]/tickets`, `PATCH /api/tickets/[id]`.  
  - Tool actions: `GET /api/rooms/[code]/tool-actions`, `POST /api/rooms/[code]/tool-actions`.

## DB Schema Summary (Prisma models)
- `User`: `id`, `email`, `name`, `image`, timestamps.
- `Room`: `id`, `code` (unique), `createdAt`.
- `RoomMember`: `id`, `roomId`, `userId`, `role`, timestamps.
- `Message`: `id`, `roomId`, `senderType`, `senderId`, `content`, `mode`, `createdAt`.
- `Ticket`: `id`, `roomId`, `title`, `description`, `suggestedOwnerId`, `ownerId?`, `priority`, `effort`, `status`, `createdAt`, `updatedAt`.
- `Meeting` (future): `id`, `roomId`, `title`, `start`, `end`, `createdAt`.
- `ToolAction`: `id`, `roomId`, `type`, `payload` (JSON), `status`, `result` (JSON), `createdAt`.

## UI Screens Checklist
- Landing `/`: create/join room, marketing hero, theme toggle, auth menu.
- Room `/room/[code]`:  
  - Left sidebar: room info, members, nav.  
  - Center: chat thread (streaming, typing indicator, scroll-to-bottom), composer. Mode chip visible.  
  - Right tabs: Tickets, Meetings, Guide (conflict doc), Activity/ToolAction log.  
  - Confirmation dialog for tool calls.
- Settings `/settings`: model & MCP readiness, privacy controls (clear local data, delete room history).
- Guide `/guide`: conflict management guide standalone view.
- Auth flows and mock-mode banner where applicable.

## Mock Mode Behavior
- If `GEMINI_API_KEY` missing, `/api/chat` returns canned/locally generated text with `mockMode: true` flag; UI shows banner.
- If `MCP_SERVER_URL` missing, tool proxy routes short-circuit with success-like mock responses and log `mockMode`.
- Seed/test data paths avoid external services; Prisma uses Postgres (set `DATABASE_URL`) in dev.

## Security & Privacy Notes
- API keys only on server; never exposed to browser or serialized to clients. Use server-side env access only.
- Tool calls require explicit user confirmation before hitting proxy endpoints.
- Provide “Clear my local data” (Zustand/TanStack caches) and “Delete room history” (server action) controls.
- Streaming endpoints validate room membership; rate-limit and log tool actions.
- Conflict guide treated as internal knowledge; do not store user data beyond room scope without consent.
