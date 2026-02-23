import { describe, it, expect } from "vitest";
import { extractJSON, tryParseTasksJson } from "../lib/agent/parseUtils";

describe("extractJSON", () => {
  it("extracts a plain JSON object", () => {
    const result = extractJSON('Here is your json: {"tasks": []}');
    expect(result).toBe('{"tasks": []}');
  });

  it("extracts from markdown code fence", () => {
    const result = extractJSON('```json\n{"tasks": []}\n```');
    expect(result).toBe('{"tasks": []}');
  });

  it("returns original string when no JSON found", () => {
    const result = extractJSON("just plain text");
    expect(result).toBe("just plain text");
  });

  it("extracts nested JSON objects", () => {
    const input = 'Response: {"tasks": [{"title": "Test", "description": "Desc"}]}';
    expect(extractJSON(input)).toContain('"tasks"');
  });
});

describe("tryParseTasksJson", () => {
  it("returns tasks from valid JSON", () => {
    const json = JSON.stringify({
      tasks: [{ title: "Build login", description: "Set up OAuth flow" }],
    });
    const result = tryParseTasksJson(json);
    expect(result).not.toBeNull();
    expect(result![0].title).toBe("Build login");
  });

  it("returns null for empty tasks array", () => {
    expect(tryParseTasksJson('{"tasks": []}')).toBeNull();
  });

  it("returns null for malformed JSON", () => {
    expect(tryParseTasksJson("{bad json")).toBeNull();
  });

  it("returns null if a task is missing title", () => {
    const json = JSON.stringify({ tasks: [{ description: "No title here" }] });
    expect(tryParseTasksJson(json)).toBeNull();
  });

  it("returns null if a task is missing description", () => {
    const json = JSON.stringify({ tasks: [{ title: "A title" }] });
    expect(tryParseTasksJson(json)).toBeNull();
  });

  it("returns null if tasks key is missing", () => {
    expect(tryParseTasksJson('{"items": []}')).toBeNull();
  });

  it("parses optional fields when present", () => {
    const json = JSON.stringify({
      tasks: [{
        title: "Write tests",
        description: "Cover all core paths",
        acceptanceCriteria: ["All tests pass"],
        effort: "S",
        due: null,
        suggestedOwnerName: "Alice",
        suggestedOwnerUserId: "user_123",
      }],
    });
    const result = tryParseTasksJson(json);
    expect(result).not.toBeNull();
    expect(result![0].effort).toBe("S");
    expect(result![0].acceptanceCriteria).toEqual(["All tests pass"]);
  });

  it("handles JSON embedded in markdown fence", () => {
    const input = '```json\n{"tasks": [{"title": "Deploy", "description": "Push to prod"}]}\n```';
    const result = tryParseTasksJson(input);
    expect(result).not.toBeNull();
    expect(result![0].title).toBe("Deploy");
  });
});
