/**
 * Thin Trello REST API v1 client.
 * Uses TRELLO_API_KEY + TRELLO_TOKEN env vars (global app credentials).
 * Per-room board/list IDs are stored in the Room table.
 */

const BASE = "https://api.trello.com/1";

function credentials() {
  const key = process.env.TRELLO_API_KEY;
  const token = process.env.TRELLO_TOKEN;
  if (!key || !token) throw new Error("TRELLO_API_KEY and TRELLO_TOKEN must be set.");
  return { key, token };
}

function qs(extra: Record<string, string> = {}) {
  const { key, token } = credentials();
  return new URLSearchParams({ key, token, ...extra }).toString();
}

export type TrelloErrorCode =
  | "AUTH_ERROR"
  | "NOT_FOUND"
  | "RATE_LIMITED"
  | "NETWORK_ERROR"
  | "UNKNOWN";

export class TrelloApiError extends Error {
  constructor(
    message: string,
    public readonly code: TrelloErrorCode,
    public readonly httpStatus: number
  ) {
    super(message);
    this.name = "TrelloApiError";
  }
}

async function trelloFetch<T>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
    });
  } catch (err) {
    throw new TrelloApiError(
      `Network error reaching Trello: ${err instanceof Error ? err.message : String(err)}`,
      "NETWORK_ERROR",
      0
    );
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let code: TrelloErrorCode = "UNKNOWN";
    if (res.status === 401 || res.status === 403) code = "AUTH_ERROR";
    else if (res.status === 404) code = "NOT_FOUND";
    else if (res.status === 429) code = "RATE_LIMITED";
    throw new TrelloApiError(`Trello API error ${res.status}: ${text}`, code, res.status);
  }
  return res.json() as Promise<T>;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type TrelloCard = {
  id: string;
  name: string;
  desc: string;
  idList: string;
  due: string | null;
  idMembers: string[];
  url: string;
};

export type TrelloList = {
  id: string;
  name: string;
  closed: boolean;
};

export type TrelloMember = {
  id: string;
  fullName: string;
  username: string;
  email?: string;
};

export type TrelloBoard = {
  id: string;
  shortLink: string;
  url: string;
  name?: string;
};

export type TrelloWebhook = {
  id: string;
  callbackURL: string;
  idModel: string;
  active: boolean;
};

// ─── Cards ────────────────────────────────────────────────────────────────────

export async function createCard(
  listId: string,
  name: string,
  desc: string,
  idMembers?: string[],
  due?: string
): Promise<TrelloCard> {
  const payload: Record<string, unknown> = { idList: listId, name, desc };
  if (idMembers && idMembers.length > 0) payload.idMembers = idMembers;
  if (due) payload.due = due;
  return trelloFetch<TrelloCard>(`/cards?${qs()}`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function getCardsByList(listId: string): Promise<TrelloCard[]> {
  return trelloFetch<TrelloCard[]>(`/lists/${listId}/cards?${qs()}`);
}

export async function getCardsByBoard(boardId: string): Promise<TrelloCard[]> {
  return trelloFetch<TrelloCard[]>(`/boards/${boardId}/cards?${qs()}`);
}

// ─── Lists ────────────────────────────────────────────────────────────────────

export async function getBoardLists(boardId: string): Promise<TrelloList[]> {
  return trelloFetch<TrelloList[]>(
    `/boards/${boardId}/lists?${qs({ filter: "open" })}`
  );
}

/** Build a map from list ID → list name for a board. */
export async function getListNameMap(boardId: string): Promise<Record<string, string>> {
  const lists = await getBoardLists(boardId);
  return Object.fromEntries(lists.map((l) => [l.id, l.name]));
}

// ─── Members ──────────────────────────────────────────────────────────────────

export async function getBoardMembers(boardId: string): Promise<TrelloMember[]> {
  return trelloFetch<TrelloMember[]>(`/boards/${boardId}/members?${qs()}`);
}

export async function getBoard(boardRef: string): Promise<TrelloBoard> {
  return trelloFetch<TrelloBoard>(
    `/boards/${boardRef}?${qs({ fields: "id,shortLink,url,name" })}`
  );
}

// ─── Webhooks ─────────────────────────────────────────────────────────────────

export async function registerWebhook(
  boardId: string,
  callbackUrl: string
): Promise<TrelloWebhook> {
  return trelloFetch<TrelloWebhook>(`/webhooks?${qs()}`, {
    method: "POST",
    body: JSON.stringify({
      callbackURL: callbackUrl,
      idModel: boardId,
      description: "GroupCopilot board sync",
    }),
  });
}

export async function deleteWebhook(webhookId: string): Promise<void> {
  await trelloFetch(`/webhooks/${webhookId}?${qs()}`, { method: "DELETE" });
}

// ─── Connectivity check ───────────────────────────────────────────────────────

/** Returns true if credentials are configured and the board is accessible. */
export async function checkConnection(boardId: string): Promise<boolean> {
  try {
    await getBoardLists(boardId);
    return true;
  } catch {
    return false;
  }
}

/** Returns true if TRELLO_API_KEY and TRELLO_TOKEN are set in env. */
export function isTrelloConfigured(): boolean {
  return !!(process.env.TRELLO_API_KEY && process.env.TRELLO_TOKEN);
}
