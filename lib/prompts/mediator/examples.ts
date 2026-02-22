export type ConflictExample = {
  category: string;
  user: string;
  assistantJson: Record<string, unknown>;
};

export const conflictExamples: ConflictExample[] = [
  {
    category: "schedule_communication",
    user: "We keep missing standups because half the team is in different time zones and people feel ignored.",
    assistantJson: {
      mode: "conflict",
      status: "facilitating",
      safety: { risk_level: "none", signals: [], escalation_message: "" },
      conflict_type: "schedule_communication",
      neutral_summary:
        "This seems to be a coordination conflict, not a motivation conflict. Some members need synchronous clarity while timezone overlap is limited. The shared goal appears to be reliable communication and fewer missed updates.",
      permission_check: { asked: false, question: "", user_response: "implied_yes" },
      clarifying_questions: [
        "How many overlap hours are available for all members on weekdays?",
        "Would a hybrid async + 2 live syncs/week model work?"
      ],
      options: [
        {
          id: "A",
          title: "Async-first daily updates",
          description: "Use a fixed async check-in template posted before a daily cutoff.",
          tradeoffs: "Less meeting burden but slower real-time clarification.",
          when_to_use: "Best when overlap is under 2 hours."
        },
        {
          id: "B",
          title: "Hybrid cadence",
          description: "Async daily updates plus two rotating live syncs each week.",
          tradeoffs: "More structure but higher scheduling overhead.",
          when_to_use: "Best when blockers still need live collaboration."
        }
      ],
      suggested_script: {
        purpose: "Propose a communication reset",
        audience: "group",
        text:
          "I think we all want better visibility, but timezone overlap makes daily live standups difficult. Could we try async daily updates with one template, plus two rotating live syncs each week for blockers?"
      },
      micro_plan: [
        {
          step: 1,
          action: "Agree async update template",
          owner: "team",
          timeframe: "today",
          done_when: "Template is pinned in room"
        },
        {
          step: 2,
          action: "Set daily update cutoff",
          owner: "owner",
          timeframe: "today",
          done_when: "Cutoff time posted"
        }
      ],
      tool_suggestions: [],
      follow_up: {
        next_question: "Do you want to trial option A or B for one week?",
        check_in_prompt: "Check in after one week: did missed updates decrease?"
      },
      citations: [],
      confidence: 0.84
    }
  },
  {
    category: "workload_fairness",
    user: "I am doing most of the coding and docs while others only show up near the deadline.",
    assistantJson: {
      mode: "conflict",
      status: "facilitating",
      safety: { risk_level: "none", signals: [], escalation_message: "" },
      conflict_type: "workload_fairness",
      neutral_summary:
        "This sounds like a workload visibility and ownership conflict. One person feels over-relied on, while others may not see imbalance until late-stage pressure. The shared goal appears to be fair contribution and predictable delivery.",
      permission_check: { asked: false, question: "", user_response: "implied_yes" },
      clarifying_questions: [
        "Do you have explicit owners and due dates for all remaining deliverables?",
        "Do you want equal hours or role-based fairness with clear ownership?"
      ],
      options: [
        {
          id: "A",
          title: "Ownership-by-ticket plan",
          description: "Assign owner + reviewer and due date for each deliverable.",
          tradeoffs: "High accountability but requires board discipline.",
          when_to_use: "Best when execution clarity is low."
        },
        {
          id: "B",
          title: "Role-based workload contract",
          description: "Set contribution expectations per role for this sprint.",
          tradeoffs: "Clear expectations but needs explicit buy-in.",
          when_to_use: "Best when skills are uneven across members."
        }
      ],
      suggested_script: {
        purpose: "Raise fairness concern without blame",
        audience: "group",
        text:
          "I am feeling stretched because coding and docs are concentrating with me near deadlines. I want us to succeed as a team, so can we set explicit owners and due dates for each deliverable this week?"
      },
      micro_plan: [
        {
          step: 1,
          action: "List all remaining deliverables",
          owner: "owner",
          timeframe: "today",
          done_when: "No missing deliverables"
        },
        {
          step: 2,
          action: "Assign owner/reviewer per deliverable",
          owner: "team",
          timeframe: "today",
          done_when: "Each deliverable has owner + reviewer"
        }
      ],
      tool_suggestions: [],
      follow_up: {
        next_question: "Would you prefer option A (ticket ownership) or option B (role contract)?",
        check_in_prompt: "Check in mid-week: is workload more balanced?"
      },
      citations: [],
      confidence: 0.87
    }
  },
  {
    category: "interpersonal_tone",
    user: "My teammate called my idea naive in front of everyone and I felt dismissed.",
    assistantJson: {
      mode: "conflict",
      status: "facilitating",
      safety: { risk_level: "none", signals: [], escalation_message: "" },
      conflict_type: "interpersonal_tone",
      neutral_summary:
        "You experienced the feedback as disrespectful, while your teammate may have intended to critique the idea under pressure. The core issue appears to be feedback tone and psychological safety in team discussions.",
      permission_check: { asked: false, question: "", user_response: "implied_yes" },
      clarifying_questions: [
        "Do you want to address this 1:1 first, or reset feedback norms in the team?",
        "Is your primary goal acknowledgment, behavior change, or both?"
      ],
      options: [
        {
          id: "A",
          title: "Private repair conversation",
          description: "Share impact in a brief 1:1 and request a feedback style change.",
          tradeoffs: "Lower defensiveness but less visible norm reset.",
          when_to_use: "Best when trust can be repaired directly."
        },
        {
          id: "B",
          title: "Team norm reset",
          description: "Agree on critique norms in the group.",
          tradeoffs: "Team-wide impact but may feel formal.",
          when_to_use: "Best when this has happened more than once."
        }
      ],
      suggested_script: {
        purpose: "Name impact and request respectful feedback",
        audience: "individual",
        text:
          "When my idea was called naive in front of the group, I felt dismissed. I am open to critical feedback, and I would appreciate framing it around constraints and alternatives rather than labels."
      },
      micro_plan: [
        {
          step: 1,
          action: "Hold a 10-minute 1:1 repair conversation",
          owner: "you",
          timeframe: "within 24 hours",
          done_when: "Conversation completed"
        },
        {
          step: 2,
          action: "Agree one feedback rule for future discussions",
          owner: "both",
          timeframe: "same day",
          done_when: "Rule acknowledged by both"
        }
      ],
      tool_suggestions: [],
      follow_up: {
        next_question: "Would you like option A (1:1 repair) or option B (team norm reset) first?",
        check_in_prompt: "Check in after the next meeting: did feedback feel more respectful?"
      },
      citations: [],
      confidence: 0.82
    }
  }
];

export function pickConflictExample(conflictType: string): ConflictExample | null {
  const normalized = conflictType.toLowerCase();
  if (normalized.includes("schedule") || normalized.includes("communication")) {
    return conflictExamples.find((example) => example.category === "schedule_communication") ?? null;
  }
  if (normalized.includes("workload") || normalized.includes("fair")) {
    return conflictExamples.find((example) => example.category === "workload_fairness") ?? null;
  }
  if (normalized.includes("tone") || normalized.includes("dismiss")) {
    return conflictExamples.find((example) => example.category === "interpersonal_tone") ?? null;
  }
  return null;
}

