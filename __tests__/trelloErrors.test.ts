import { describe, it, expect, vi, afterEach } from "vitest";
import { TrelloApiError } from "../lib/trello/client";

// We test TrelloApiError shape + that the client throws the right code per HTTP status.
// The actual trelloFetch is tested via global fetch mock.

describe("TrelloApiError", () => {
  it("is an instance of Error", () => {
    const err = new TrelloApiError("Board not found", "NOT_FOUND", 404);
    expect(err).toBeInstanceOf(Error);
  });

  it("exposes code and httpStatus", () => {
    const err = new TrelloApiError("Unauthorized", "AUTH_ERROR", 401);
    expect(err.code).toBe("AUTH_ERROR");
    expect(err.httpStatus).toBe(401);
  });

  it("has name TrelloApiError", () => {
    const err = new TrelloApiError("msg", "UNKNOWN", 500);
    expect(err.name).toBe("TrelloApiError");
  });
});

describe("trelloFetch error codes (mocked fetch)", () => {
  afterEach(() => vi.restoreAllMocks());

  async function importAndCall(status: number) {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status,
      text: async () => "error body",
    }));
    // Dynamic import so the stub is in place before module-level code runs
    const { getBoardLists } = await import("../lib/trello/client");
    // Provide dummy env
    process.env.TRELLO_API_KEY = "key";
    process.env.TRELLO_TOKEN = "tok";
    return getBoardLists("board123");
  }

  it("throws AUTH_ERROR on 401", async () => {
    await expect(importAndCall(401)).rejects.toMatchObject({ code: "AUTH_ERROR", httpStatus: 401 });
  });

  it("throws AUTH_ERROR on 403", async () => {
    await expect(importAndCall(403)).rejects.toMatchObject({ code: "AUTH_ERROR", httpStatus: 403 });
  });

  it("throws NOT_FOUND on 404", async () => {
    await expect(importAndCall(404)).rejects.toMatchObject({ code: "NOT_FOUND", httpStatus: 404 });
  });

  it("throws RATE_LIMITED on 429", async () => {
    await expect(importAndCall(429)).rejects.toMatchObject({ code: "RATE_LIMITED", httpStatus: 429 });
  });
});
