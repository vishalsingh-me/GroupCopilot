# GroupCoPilot

**AI Collaboration Governor for Student Group Projects**

GroupCoPilot monitors team health in real time and intervenes — before deadlines slip, communication breaks down, or workload becomes unfair. Built for the BU Civic Hackathon (Education Track).

---

## What it does

Group projects fail for predictable reasons: unclear ownership, uneven workload, missed deadlines, and unresolved conflict. GroupCoPilot runs quietly in the background and surfaces problems early:

| Signal | What it detects |
|---|---|
| **Workload imbalance** | Coefficient of variation across task point totals |
| **Deadline risk** | Overdue tasks + tasks due within 48 h, weighted by priority |
| **Communication risk** | Negativity trend in messages (AFINN sentiment) |
| **Goal drift** | Cosine distance between team goal embedding and active task embeddings |

When a signal crosses a configurable threshold, an **alert** is raised. The team can dismiss, snooze, or act on it. Repeated dismissals automatically raise the threshold (+15%) to reduce noise.

The **Ask Pact** feature lets teams interrogate their own team contract ("are we living up to what we agreed to?") using RAG over uploaded rubric/syllabus documents, grounded by Gemini.

---

## Architecture

```
app/
├── (marketing)/     Landing page — create or join a room
├── (app)/           Authenticated app shell
│   ├── room/        Live chat room (brainstorm / planning / conflict / general modes)
│   ├── knowledge/   Upload & index rubric sources, Ask Pact
│   └── settings/    Team thresholds, integrations
├── api/             REST API routes (see below)
└── providers.tsx    ThemeProvider + QueryClient + ToastProvider

worker/
├── index.ts                      pg-boss worker entry point
└── jobs/
    ├── index-rubric-source.ts    Chunk + embed uploaded docs (Gemini text-embedding-004)
    ├── recompute-signals.ts      Compute all 4 team health signals
    ├── evaluate-alerts.ts        Alert rules engine (threshold / cooldown / snooze)
    └── compute-message-signal.ts AFINN sentiment per message

db/
├── schema/                       21-table Drizzle schema (Postgres + pgvector)
└── migrations/                   SQL migrations with HNSW index for cosine similarity

server/
├── auth.ts           Passwordless session auth (SHA-256, httpOnly cookie)
├── api.ts            Shared response helpers (ok / err / handleRouteError)
└── interventions.ts  Ask Pact — RAG retrieval + Gemini generation

shared/
└── contracts.ts      Request/response types shared between frontend and backend
```

---

## API Routes

| Route | Methods | Description |
|---|---|---|
| `/api/auth/login` | POST | Passwordless upsert — email + display name |
| `/api/auth/logout` | POST | Clear session cookie |
| `/api/me` | GET | Current user |
| `/api/teams` | GET, POST | List / create teams |
| `/api/teams/[id]/invites` | POST | Generate invite token |
| `/api/invites/join` | POST | Join team via token |
| `/api/teams/[id]/contract` | GET, PUT | Team contract (goals, norms) |
| `/api/teams/[id]/contract/generate` | POST | Gemini-generated draft contract |
| `/api/teams/[id]/tasks` | GET, POST | List / create tasks |
| `/api/tasks/[id]` | PATCH | Update task (status, assignee, points) |
| `/api/tasks/[id]/dependencies` | POST | Add task dependency |
| `/api/teams/[id]/messages` | GET, POST | Team messages |
| `/api/teams/[id]/signals` | GET | Latest team health signals |
| `/api/teams/[id]/alerts` | GET | Open alerts |
| `/api/alerts/[id]/action` | POST | Dismiss / snooze / resolve alert |
| `/api/teams/[id]/rubric-sources` | GET, POST | Upload rubric / syllabus docs |
| `/api/teams/[id]/ask-pact` | POST | RAG query against team contract + rubric |
| `/api/chat` | POST | Gemini chat proxy (room mode) |
| `/api/tools/notion/create-task` | POST | Notion integration (MCP or mock) |
| `/api/tools/calendar/create-event` | POST | Google Calendar integration (MCP or mock) |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 15 (App Router), TypeScript, React 19 |
| Styling | Tailwind CSS v3, shadcn/ui component primitives |
| Database | PostgreSQL 16 + pgvector (HNSW index for cosine similarity) |
| ORM | Drizzle ORM + drizzle-kit |
| Job queue | pg-boss (Postgres-backed, no Redis required) |
| LLM | Gemini (`gemini-3-pro-preview` for text, `text-embedding-004` for embeddings) |
| State (client) | Zustand |
| Server state | TanStack Query |
| Sentiment | AFINN via `sentiment` npm package (zero LLM cost per message) |
| Auth | Passwordless — email + display name → SHA-256 session token |

---

## Getting Started

### Prerequisites

- Node.js 18+
- Docker (for Postgres)
- Gemini API key ([get one here](https://aistudio.google.com/))

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

```bash
cp .env.example .env.local
# Edit .env.local — set GEMINI_API_KEY and SESSION_SECRET at minimum
```

Key variables:

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | Postgres connection string |
| `SESSION_SECRET` | Yes | 32+ char secret for session signing |
| `GEMINI_API_KEY` | Yes (for live AI) | Gemini API key |
| `APP_BASE_URL` | Yes | e.g. `http://localhost:3000` |
| `NEXT_PUBLIC_APP_NAME` | No | Overrides app title in UI |
| `MCP_SERVER_URL` | No | MCP server for Notion/Calendar tool calls |
| `WORKER_CONCURRENCY` | No | Parallel job slots (default: 5) |

### 3. Start the database

```bash
docker compose up -d
```

### 4. Run migrations

```bash
npm run db:migrate
```

### 5. (Optional) Seed demo data

Creates Alice/Bob/Carol, a team with imbalanced tasks, and pre-computed signals for demo purposes.

```bash
npm run seed
```

### 6. Start the app

```bash
# Terminal 1 — Next.js dev server
npm run dev

# Terminal 2 — Background worker (signals, alerts, embeddings)
npm run dev:worker
```

### Environment variables
- `GEMINI_API_KEY` (server-side) - required for live Gemini proxying
- `MCP_SERVER_URL` (server-side) - required for real MCP tool calls
- `NEXT_PUBLIC_APP_NAME` (optional) - overrides app title
- `NEXTAUTH_URL` - base URL for Auth.js
- `NEXTAUTH_SECRET` - secret for session signing
- `GOOGLE_CLIENT_ID` - Google OAuth client ID
- `GOOGLE_CLIENT_SECRET` - Google OAuth client secret

---

## Database tools

```bash
npm run db:generate   # Generate a new migration from schema changes
npm run db:migrate    # Apply pending migrations
npm run db:studio     # Open Drizzle Studio (visual DB browser)
```

---

## Mock mode

When environment variables are missing, the app degrades gracefully:

- **No `GEMINI_API_KEY`** → `/api/chat` returns mocked responses; UI shows "Mock mode enabled."
- **No `MCP_SERVER_URL`** → `/api/tools/*` return mocked success responses.
- Worker jobs will not embed documents without a valid Gemini key, but the rest of the app functions normally.

---

## Team

Built at the BU Civic Hackathon by a 2-person team:

- **Person A** — UI/Product: chat room, marketing page, component library, theming
- **Person B** — Platform/Intelligence: database schema, API layer, background worker, AI signals, RAG pipeline
