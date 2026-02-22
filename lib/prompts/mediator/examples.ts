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
  },
  {
    category: "goals_priorities",
    user: "We keep arguing about whether to ship features or focus on stability. The scope keeps changing.",
    assistantJson: {
      mode: "conflict",
      status: "facilitating",
      safety: { risk_level: "none", signals: [], escalation_message: "" },
      conflict_type: "goals_priorities",
      neutral_summary:
        "This sounds like a priorities and scope conflict: some people want visible feature progress, while others want reliability and fewer surprises. Both sides likely share the goal of a successful demo, but disagree on the best path given time constraints.",
      permission_check: { asked: false, question: "", user_response: "implied_yes" },
      clarifying_questions: [
        "What is the single most important success metric for the next demo (feature coverage vs. stability)?",
        "How many days of work remain before the deadline?"
      ],
      options: [
        {
          id: "A",
          title: "Time-box stability, then ship",
          description: "Spend a short, fixed window on stability fixes, then lock scope and build only what fits.",
          tradeoffs: "Reduces risk but may cut feature ambition.",
          when_to_use: "Best when the deadline is close and bugs are already slowing progress."
        },
        {
          id: "B",
          title: "Define an MVP + explicit stretch list",
          description: "Agree on a minimal demo path and a separate stretch list that is explicitly optional.",
          tradeoffs: "Keeps momentum but requires discipline not to pull in stretch items.",
          when_to_use: "Best when the team needs alignment and scope keeps drifting."
        },
        {
          id: "C",
          title: "Feature-first with a quality gate",
          description: "Continue feature work but enforce a 'no-new-features' cutoff date for stabilization.",
          tradeoffs: "Maximizes features but increases late-stage risk if bugs pile up.",
          when_to_use: "Best when the product is already stable and testing is working."
        }
      ],
      suggested_script: {
        purpose: "Align on scope and a stability plan",
        audience: "group",
        text:
          "I think we all want a strong demo. It seems like our disagreement is whether stability or features is the bigger risk right now. Can we pick one success metric for the demo, lock an MVP, and time-box stabilization so we stop scope drifting?"
      },
      micro_plan: [
        {
          step: 1,
          action: "Agree demo success metric + MVP scope",
          owner: "team",
          timeframe: "today",
          done_when: "MVP scope is written and acknowledged by everyone"
        },
        {
          step: 2,
          action: "Create stretch list and set a feature cutoff date",
          owner: "owner",
          timeframe: "today",
          done_when: "Stretch list and cutoff date are posted in the room"
        },
        {
          step: 3,
          action: "Add a stability time-box and top 3 risks",
          owner: "team",
          timeframe: "today",
          done_when: "Stability window and top risks are agreed"
        }
      ],
      tool_suggestions: [],
      follow_up: {
        next_question: "Do you want option A (time-box stability), B (MVP + stretch), or C (quality gate)?",
        check_in_prompt: "Check in after 48 hours: is scope stable and are we shipping against the MVP?"
      },
      citations: [],
      confidence: 0.83
    }
  },
  {
    category: "decision_process",
    user: "We are deadlocked. Two people want React, two want Vue, and we keep going in circles.",
    assistantJson: {
      mode: "conflict",
      status: "facilitating",
      safety: { risk_level: "none", signals: [], escalation_message: "" },
      conflict_type: "decision_process",
      neutral_summary:
        "This appears to be a decision-process conflict, not a values conflict. The team likely shares the goal of picking a stack quickly, but lacks an agreed method for breaking ties and weighing criteria under time pressure.",
      permission_check: { asked: false, question: "", user_response: "implied_yes" },
      clarifying_questions: [
        "What is the deadline for making this decision (today vs. this week)?",
        "What are the top 2 criteria that matter most (speed to build, team familiarity, deployment)?"
      ],
      options: [
        {
          id: "A",
          title: "Criteria + time-boxed vote",
          description: "Agree on 2-3 criteria, score each option quickly, then vote with a preset tiebreak.",
          tradeoffs: "Fast and fair but may feel rigid.",
          when_to_use: "Best when the team needs speed and the decision is blocking work."
        },
        {
          id: "B",
          title: "Owner-decides with accountability",
          description: "Choose a decision owner for this area; they decide after hearing input and commit to a review point.",
          tradeoffs: "Fast but requires trust in the owner.",
          when_to_use: "Best when time is tight and someone is accountable for execution."
        },
        {
          id: "C",
          title: "Parallel spike then decide",
          description: "Do a short spike in both stacks to test the riskiest requirement, then pick based on evidence.",
          tradeoffs: "More reliable but costs time up front.",
          when_to_use: "Best when unknowns are high and the wrong choice is costly."
        }
      ],
      suggested_script: {
        purpose: "Break a deadlock with a fair process",
        audience: "group",
        text:
          "We seem stuck because we don't have a shared way to decide. Can we pick 3 criteria, time-box scoring for 20 minutes, then vote with a clear tiebreak rule so we can move forward today?"
      },
      micro_plan: [
        {
          step: 1,
          action: "Agree 3 decision criteria",
          owner: "team",
          timeframe: "10 minutes",
          done_when: "Criteria are written down"
        },
        {
          step: 2,
          action: "Score each option (0-2) per criterion",
          owner: "team",
          timeframe: "20 minutes",
          done_when: "Scores are posted"
        },
        {
          step: 3,
          action: "Vote + apply tiebreak rule",
          owner: "owner",
          timeframe: "5 minutes",
          done_when: "A final decision is recorded"
        }
      ],
      tool_suggestions: [],
      follow_up: {
        next_question: "Which process feels best right now: A (criteria+vote), B (owner decides), or C (spike)?",
        check_in_prompt: "Check in tomorrow: did the decision unblock work and reduce debate?"
      },
      citations: [],
      confidence: 0.84
    }
  },
  {
    category: "role_ambiguity",
    user: "No one owns testing and everyone assumes someone else will do it. We keep missing bugs.",
    assistantJson: {
      mode: "conflict",
      status: "facilitating",
      safety: { risk_level: "none", signals: [], escalation_message: "" },
      conflict_type: "role_ambiguity",
      neutral_summary:
        "This sounds like a role and ownership clarity conflict. People may be contributing, but unclear accountability is causing testing to fall through the cracks. The shared goal is fewer bugs and a reliable delivery.",
      permission_check: { asked: false, question: "", user_response: "implied_yes" },
      clarifying_questions: [
        "Is there a release deadline or demo date this week?",
        "What is the minimum testing standard you want before merging changes?"
      ],
      options: [
        {
          id: "A",
          title: "Assign a single testing owner",
          description: "Pick one owner responsible for the testing checklist and sign-off each day.",
          tradeoffs: "Clear accountability but may overload one person.",
          when_to_use: "Best when you need immediate clarity and the team is small."
        },
        {
          id: "B",
          title: "Owner + rotating reviewer",
          description: "Each feature has an owner and a rotating reviewer responsible for testing before merge.",
          tradeoffs: "More balanced but requires coordination.",
          when_to_use: "Best when work is parallel and you want shared responsibility."
        },
        {
          id: "C",
          title: "Definition of Done includes tests",
          description: "Agree that every task must include a minimal test/demo checklist before it's 'done'.",
          tradeoffs: "Improves quality but can slow throughput short-term.",
          when_to_use: "Best when quality issues are recurring."
        }
      ],
      suggested_script: {
        purpose: "Set ownership and a simple testing standard",
        audience: "group",
        text:
          "I think our bug issues are less about effort and more about ownership. Can we assign a testing owner (or owner+reviewer) and agree on a simple checklist so testing doesn't get assumed by everyone and done by no one?"
      },
      micro_plan: [
        {
          step: 1,
          action: "Write a 5-item testing checklist",
          owner: "team",
          timeframe: "today",
          done_when: "Checklist is posted"
        },
        {
          step: 2,
          action: "Assign testing owner (or rotating reviewer)",
          owner: "owner",
          timeframe: "today",
          done_when: "Owner/reviewer is assigned for this week"
        },
        {
          step: 3,
          action: "Add checklist to Definition of Done",
          owner: "team",
          timeframe: "today",
          done_when: "Every task includes testing acceptance criteria"
        }
      ],
      tool_suggestions: [],
      follow_up: {
        next_question: "Do you want A (single testing owner), B (owner+reviewer), or C (DoD includes tests) first?",
        check_in_prompt: "Check in after the next merge: did bugs drop and did testing actually happen?"
      },
      citations: [],
      confidence: 0.83
    }
  },
  {
    category: "other",
    user: "Our group chat is chaotic and people talk over each other, so meetings feel unproductive.",
    assistantJson: {
      mode: "conflict",
      status: "facilitating",
      safety: { risk_level: "none", signals: [], escalation_message: "" },
      conflict_type: "other",
      neutral_summary:
        "This seems like a coordination and communication-norm conflict. People likely want to contribute, but the current format makes it hard to hear each other, capture decisions, and leave with clear next steps.",
      permission_check: { asked: false, question: "", user_response: "implied_yes" },
      clarifying_questions: [
        "Are these issues happening mostly in live meetings, async chat, or both?",
        "Do you have a shared place where decisions and next steps are written down?"
      ],
      options: [
        {
          id: "A",
          title: "Facilitated agenda + timeboxing",
          description: "Use a short agenda, timebox topics, and assign a facilitator and notetaker.",
          tradeoffs: "More structure but less free-form discussion.",
          when_to_use: "Best when meetings drift and decisions aren't recorded."
        },
        {
          id: "B",
          title: "Async-first with decision posts",
          description: "Move discussion async and require a clear decision post with owner and date.",
          tradeoffs: "Less meeting time but slower real-time alignment.",
          when_to_use: "Best when schedules are tight or overlap is limited."
        },
        {
          id: "C",
          title: "Simple speaking rules",
          description: "Adopt one rule like 'no interruptions' or 'raise hand in chat' to reduce talking over.",
          tradeoffs: "Lightweight but needs reinforcement.",
          when_to_use: "Best when tone is mostly good but structure is missing."
        }
      ],
      suggested_script: {
        purpose: "Reset meeting norms without blame",
        audience: "group",
        text:
          "I think we all want productive meetings, but our current format makes it hard to hear everyone and capture decisions. Can we try a short agenda with timeboxes, plus a facilitator and notetaker, for the next meeting?"
      },
      micro_plan: [
        {
          step: 1,
          action: "Pick facilitator + notetaker for next meeting",
          owner: "team",
          timeframe: "today",
          done_when: "Roles are assigned"
        },
        {
          step: 2,
          action: "Use a 3-topic agenda with timeboxes",
          owner: "facilitator",
          timeframe: "next meeting",
          done_when: "Meeting ends with decisions + owners posted"
        }
      ],
      tool_suggestions: [],
      follow_up: {
        next_question: "Would you like to try option A (agenda+roles), B (async-first), or C (speaking rule) next?",
        check_in_prompt: "Check in after the next meeting: did you leave with clear owners and fewer interruptions?"
      },
      citations: [],
      confidence: 0.8
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
  if (normalized.includes("goal") || normalized.includes("priorit")) {
    return conflictExamples.find((example) => example.category === "goals_priorities") ?? null;
  }
  if (normalized.includes("decision") || normalized.includes("deadlock") || normalized.includes("vote")) {
    return conflictExamples.find((example) => example.category === "decision_process") ?? null;
  }
  if (normalized.includes("role") || normalized.includes("ownership") || normalized.includes("responsibility")) {
    return conflictExamples.find((example) => example.category === "role_ambiguity") ?? null;
  }
  if (normalized.includes("other")) {
    return conflictExamples.find((example) => example.category === "other") ?? null;
  }
  return null;
}
