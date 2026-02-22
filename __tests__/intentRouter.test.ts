import { describe, it, expect } from "vitest";
import { classifyIntent, buildSmallTalkReply, nextActionHint } from "../lib/agent/intentRouter";

describe("classifyIntent", () => {
  // Small talk
  it("classifies 'hi' as SMALL_TALK", () => expect(classifyIntent("hi")).toBe("SMALL_TALK"));
  it("classifies 'Hey!' as SMALL_TALK", () => expect(classifyIntent("Hey!")).toBe("SMALL_TALK"));
  it("classifies 'thanks' as SMALL_TALK", () => expect(classifyIntent("thanks")).toBe("SMALL_TALK"));
  it("classifies 'How are you?' as SMALL_TALK", () => expect(classifyIntent("How are you?")).toBe("SMALL_TALK"));
  it("classifies 'ok' as SMALL_TALK", () => expect(classifyIntent("ok")).toBe("SMALL_TALK"));
  it("classifies 'sounds good' as SMALL_TALK", () => expect(classifyIntent("sounds good")).toBe("SMALL_TALK"));

  // Kickoff
  it("classifies 'Let's start the weekly planning' as KICKOFF_REQUEST", () =>
    expect(classifyIntent("Let's start the weekly planning")).toBe("KICKOFF_REQUEST"));
  it("classifies 'begin weekly session' as KICKOFF_REQUEST", () =>
    expect(classifyIntent("begin weekly session")).toBe("KICKOFF_REQUEST"));
  it("classifies 'kickoff planning' as KICKOFF_REQUEST", () =>
    expect(classifyIntent("kickoff planning")).toBe("KICKOFF_REQUEST"));

  // Gate feedback
  it("classifies 'change milestone 2 to something better' as GATE_FEEDBACK", () =>
    expect(classifyIntent("change milestone 2 to something better")).toBe("GATE_FEEDBACK"));
  it("classifies 'update task 1 to be more specific' as GATE_FEEDBACK", () =>
    expect(classifyIntent("update task 1 to be more specific")).toBe("GATE_FEEDBACK"));
  it("classifies 'remove milestone 3' as GATE_FEEDBACK", () =>
    expect(classifyIntent("remove milestone 3")).toBe("GATE_FEEDBACK"));

  // Actionable
  it("classifies substantive messages as ACTIONABLE", () =>
    expect(classifyIntent("I plan to work on the login page and fix the API bug")).toBe("ACTIONABLE"));
  it("classifies project goal messages as ACTIONABLE", () =>
    expect(classifyIntent("Our goal is to build an MVP for the hackathon")).toBe("ACTIONABLE"));
  it("classifies planning messages as ACTIONABLE", () =>
    expect(classifyIntent("This week I want to finish the database schema and write tests")).toBe("ACTIONABLE"));
});

describe("buildSmallTalkReply", () => {
  it("mentions pending approval when gate is open", () => {
    const reply = buildSmallTalkReply("hi", true, "");
    expect(reply).toContain("approval pending");
  });

  it("includes nextActionHint when no gate is open", () => {
    const hint = "Want to **start this week's planning**? Just say the word.";
    const reply = buildSmallTalkReply("hi", false, hint);
    expect(reply).toContain(hint);
  });

  it("responds warmly to 'thank you'", () => {
    const reply = buildSmallTalkReply("thank you", false, "");
    expect(reply.toLowerCase()).toContain("welcome");
  });
});

describe("nextActionHint", () => {
  it("gives IDLE hint about starting planning", () => {
    expect(nextActionHint("IDLE")).toContain("start this week");
  });

  it("gives APPROVAL_GATE_1 hint about voting", () => {
    expect(nextActionHint("APPROVAL_GATE_1")).toContain("vote");
  });

  it("gives empty string for unknown state", () => {
    expect(nextActionHint("UNKNOWN_STATE")).toBe("");
  });
});
