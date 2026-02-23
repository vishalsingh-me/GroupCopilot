import { describe, it, expect } from "vitest";
import { classifyGeminiError } from "../lib/llm/gemini";

describe("classifyGeminiError", () => {
  it("classifies 404 / model not found errors", () => {
    const { errorType } = classifyGeminiError(new Error("models/gemini-9-ultra not found (404)"));
    expect(errorType).toBe("MODEL_NOT_FOUND");
  });

  it("classifies quota / 429 errors", () => {
    const { errorType } = classifyGeminiError(new Error("RESOURCE_EXHAUSTED: quota exceeded 429"));
    expect(errorType).toBe("QUOTA_EXCEEDED");
  });

  it("classifies invalid API key / 403 errors", () => {
    const { errorType } = classifyGeminiError(new Error("API_KEY invalid key 403"));
    expect(errorType).toBe("AUTH_ERROR");
  });

  it("classifies network / fetch failed errors", () => {
    const { errorType } = classifyGeminiError(new Error("fetch failed: ENOTFOUND generativelanguage.googleapis.com"));
    expect(errorType).toBe("NETWORK_ERROR");
  });

  it("classifies unknown errors as SDK_ERROR", () => {
    const { errorType } = classifyGeminiError(new Error("Something completely unexpected happened"));
    expect(errorType).toBe("SDK_ERROR");
  });

  it("handles non-Error objects gracefully", () => {
    const { errorType } = classifyGeminiError("some string error");
    expect(errorType).toBe("SDK_ERROR");
  });

  it("never leaks the raw error message in errorMessageSafe", () => {
    const { errorMessageSafe } = classifyGeminiError(new Error("secret-api-key-12345 rejected"));
    // The safe message should not contain raw error internals
    expect(errorMessageSafe).not.toContain("secret-api-key-12345");
  });
});
