/**
 * Demo seed script — creates a full scenario for demo purposes.
 * Run: npm run seed
 */
import "dotenv/config";
import { db, pool } from "@/db";
import {
  users,
  sessions,
  teams,
  teamMembers,
  teamContracts,
  teamThresholds,
  tasks,
  taskAssignments,
  taskDependencies,
  messages,
  rubricSources,
  teamSignals,
} from "@/db/schema";
import { createHash, randomBytes } from "crypto";

function generateToken() {
  return randomBytes(32).toString("hex");
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

async function main() {
  console.log("Seeding demo data...");

  // ── Users ──────────────────────────────────────────────────────────────────
  const now = new Date();

  const [alice] = await db
    .insert(users)
    .values({
      email: "alice@demo.local",
      displayName: "Alice Chen",
      lastLoginAt: now,
    })
    .onConflictDoUpdate({
      target: users.email,
      set: { displayName: "Alice Chen", lastLoginAt: now },
    })
    .returning();

  const [bob] = await db
    .insert(users)
    .values({
      email: "bob@demo.local",
      displayName: "Bob Patel",
      lastLoginAt: now,
    })
    .onConflictDoUpdate({
      target: users.email,
      set: { displayName: "Bob Patel", lastLoginAt: now },
    })
    .returning();

  const [carol] = await db
    .insert(users)
    .values({
      email: "carol@demo.local",
      displayName: "Carol Wu",
      lastLoginAt: now,
    })
    .onConflictDoUpdate({
      target: users.email,
      set: { displayName: "Carol Wu", lastLoginAt: now },
    })
    .returning();

  console.log(`Users: alice=${alice.id}, bob=${bob.id}, carol=${carol.id}`);

  // ── Sessions (auto-login tokens for demo) ──────────────────────────────────
  const sessionTtl = 7 * 24 * 60 * 60 * 1000;
  const aliceToken = generateToken();
  const bobToken = generateToken();

  await db
    .insert(sessions)
    .values([
      {
        userId: alice.id,
        tokenHash: hashToken(aliceToken),
        expiresAt: new Date(now.getTime() + sessionTtl),
      },
      {
        userId: bob.id,
        tokenHash: hashToken(bobToken),
        expiresAt: new Date(now.getTime() + sessionTtl),
      },
    ])
    .onConflictDoNothing();

  console.log(`Demo login tokens:`);
  console.log(`  Alice: gcp_session=${aliceToken}`);
  console.log(`  Bob:   gcp_session=${bobToken}`);

  // ── Team ───────────────────────────────────────────────────────────────────
  const [team] = await db
    .insert(teams)
    .values({
      name: "CS 3850 — Group 7",
      courseId: "CS-3850",
      createdByUserId: alice.id,
    })
    .returning();

  console.log(`Team: ${team.id}`);

  await db.insert(teamMembers).values([
    { teamId: team.id, userId: alice.id, role: "owner" },
    { teamId: team.id, userId: bob.id, role: "member", invitedByUserId: alice.id },
    { teamId: team.id, userId: carol.id, role: "member", invitedByUserId: alice.id },
  ]).onConflictDoNothing();

  // ── Team Contract ──────────────────────────────────────────────────────────
  await db.insert(teamContracts).values({
    teamId: team.id,
    version: 1,
    goalsText:
      "Build a web app that helps students manage group projects with AI-powered insights. " +
      "Deliver a working MVP demo by end of semester with full rubric compliance.",
    availabilityJsonb: {
      alice: "Mon/Wed 3–6pm, Fri anytime",
      bob: "Tue/Thu 2–5pm, weekends flexible",
      carol: "Mon–Fri evenings after 6pm",
    },
    commsPrefsJsonb: {
      primary: "Discord",
      response_time: "within 4 hours",
      meetings: "weekly Monday 4pm",
    },
    rolesJsonb: {
      alice: "Project Lead, Backend",
      bob: "Frontend, UX",
      carol: "Data, ML pipeline",
    },
    escalationJsonb: {
      step1: "Direct message the person",
      step2: "Raise in weekly meeting",
      step3: "Flag to course TA",
    },
    generatedContractText:
      "# CS 3850 Group 7 — Team Charter\n\n## Goals\nBuild a web app helping students manage group projects...\n\n## Roles\n- Alice: Project Lead & Backend\n- Bob: Frontend & UX\n- Carol: Data & ML\n\n## Communication\nPrimary channel: Discord. Response within 4 hours expected...",
  });

  // ── Team Thresholds ────────────────────────────────────────────────────────
  const alertTypes = [
    "workload_imbalance",
    "deadline_risk",
    "communication_risk",
    "drift",
  ] as const;

  await db
    .insert(teamThresholds)
    .values(
      alertTypes.map((alertType) => ({
        teamId: team.id,
        alertType,
        thresholdLow: "0.3",
        thresholdMed: "0.55",
        thresholdHigh: "0.75",
        cooldownDays: 3,
        snoozeDefaultHours: 48,
      }))
    )
    .onConflictDoNothing();

  // ── Tasks (imbalanced scenario) ────────────────────────────────────────────
  const dueIn2Days = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);
  const dueIn5Days = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000);
  const dueIn10Days = new Date(now.getTime() + 10 * 24 * 60 * 60 * 1000);
  const overdueDate = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);

  const taskDefs = [
    // Alice's heavy load (imbalance scenario)
    {
      title: "Design database schema",
      description: "Create all Postgres tables with pgvector support",
      status: "done" as const,
      priority: "high" as const,
      effortPoints: 5,
      dueAt: dueIn10Days,
      assignee: alice.id,
    },
    {
      title: "Implement auth endpoints",
      description: "Login/logout/session management",
      status: "in_progress" as const,
      priority: "high" as const,
      effortPoints: 4,
      dueAt: dueIn2Days,
      assignee: alice.id,
    },
    {
      title: "Build RAG pipeline",
      description: "Chunk, embed, store rubric documents",
      status: "todo" as const,
      priority: "high" as const,
      effortPoints: 6,
      dueAt: dueIn2Days, // due soon
      assignee: alice.id,
    },
    {
      title: "Signals computation",
      description: "Compute 4 team health signals",
      status: "todo" as const,
      priority: "medium" as const,
      effortPoints: 5,
      dueAt: dueIn5Days,
      assignee: alice.id,
    },
    // Bob's light load
    {
      title: "Design landing page mockup",
      description: "Figma wireframes for main dashboard",
      status: "done" as const,
      priority: "medium" as const,
      effortPoints: 2,
      dueAt: dueIn10Days,
      assignee: bob.id,
    },
    {
      title: "Set up Tailwind + shadcn",
      description: "Configure component library",
      status: "done" as const,
      priority: "low" as const,
      effortPoints: 1,
      dueAt: dueIn10Days,
      assignee: bob.id,
    },
    // Carol's tasks
    {
      title: "Write evaluation harness",
      description: "Synthetic scenarios for alert precision/recall",
      status: "todo" as const,
      priority: "medium" as const,
      effortPoints: 3,
      dueAt: dueIn5Days,
      assignee: carol.id,
    },
    {
      title: "OVERDUE: Data analysis report",
      description: "Analyze team signal accuracy",
      status: "todo" as const,
      priority: "high" as const,
      effortPoints: 3,
      dueAt: overdueDate, // overdue!
      assignee: carol.id,
    },
  ];

  const createdTasks = [];
  for (const def of taskDefs) {
    const [task] = await db
      .insert(tasks)
      .values({
        teamId: team.id,
        title: def.title,
        description: def.description,
        status: def.status,
        priority: def.priority,
        effortPoints: def.effortPoints,
        dueAt: def.dueAt,
        createdByUserId: alice.id,
      })
      .returning();

    await db.insert(taskAssignments).values({
      taskId: task.id,
      userId: def.assignee,
      assignmentRole: "owner",
    });

    createdTasks.push({ ...task, assignee: def.assignee });
  }

  // Add dependency: RAG pipeline blocks Signals computation
  await db.insert(taskDependencies).values({
    teamId: team.id,
    blockingTaskId: createdTasks[2].id, // RAG pipeline
    blockedTaskId: createdTasks[3].id,  // Signals computation
    dependencyType: "blocks",
    weight: "1",
  }).onConflictDoNothing();

  console.log(`Tasks created: ${createdTasks.length}`);

  // ── Messages (mild negativity trend) ──────────────────────────────────────
  const msgDefs = [
    {
      author: alice.id,
      body: "Hey team, let's sync on the auth implementation this week",
      daysAgo: 10,
    },
    {
      author: bob.id,
      body: "Sounds good! I'm still working on the UI mockups",
      daysAgo: 10,
    },
    {
      author: carol.id,
      body: "I can't make Monday's meeting, can we reschedule?",
      daysAgo: 9,
    },
    {
      author: alice.id,
      body: "This is getting overwhelming, there's too much on my plate",
      daysAgo: 5,
    },
    {
      author: bob.id,
      body: "I understand, maybe we should redistribute some tasks?",
      daysAgo: 5,
    },
    {
      author: carol.id,
      body: "I still haven't heard back about the data analysis. This is frustrating.",
      daysAgo: 3,
    },
    {
      author: alice.id,
      body: "Sorry for the slow response. I'm buried in backend work.",
      daysAgo: 2,
    },
  ];

  for (const def of msgDefs) {
    const createdAt = new Date(now.getTime() - def.daysAgo * 24 * 60 * 60 * 1000);
    await db.insert(messages).values({
      teamId: team.id,
      authorUserId: def.author,
      body: def.body,
      createdAt,
    });
  }

  console.log(`Messages: ${msgDefs.length}`);

  // ── Rubric Source ──────────────────────────────────────────────────────────
  await db.insert(rubricSources).values({
    teamId: team.id,
    kind: "rubric",
    sourceType: "paste",
    rawText: `# CS 3850 Group Project Rubric

## Section 1: Project Planning & Organization (25 points)
- Clear project goals and scope defined (5 pts)
- Roles and responsibilities assigned to all members (5 pts)
- Realistic timeline with milestones (5 pts)
- Task tracking system in use (5 pts)
- Regular team meetings documented (5 pts)

## Section 2: Technical Implementation (40 points)
- Code quality and documentation (10 pts)
- Feature completeness vs. stated goals (15 pts)
- Testing coverage (10 pts)
- Deployment and reproducibility (5 pts)

## Section 3: Collaboration & Process (25 points)
- Evidence of equal contribution from all members (10 pts)
- Communication log shows active participation (5 pts)
- Conflict resolution documented if applicable (5 pts)
- Peer evaluations complete (5 pts)

## Section 4: Presentation & Demo (10 points)
- Clear problem statement and solution explanation (5 pts)
- Live demo without critical failures (5 pts)

## Important Policies
- All team members must contribute meaningfully to receive full credit.
- If workload imbalance exceeds 30%, team must document redistribution plan.
- Late submissions lose 10% per day.
- Academic integrity: all AI-generated content must be disclosed and reviewed by team.
`,
    indexStatus: "done",
    indexedAt: new Date(),
    createdByUserId: alice.id,
  });

  // ── Pre-compute team signals (demo state) ─────────────────────────────────
  await db
    .insert(teamSignals)
    .values({
      teamId: team.id,
      computedAt: now,
      workloadImbalance: "0.72", // high — Alice is overloaded
      deadlineRisk: "0.61",     // med — overdue task + 2 due in 48h
      communicationRisk: "0.42", // low-med — some negativity trend
      drift: "0",              // no embeddings yet
      supportingMetricsJsonb: {
        workload: {
          memberWorkloads: {
            [alice.id]: 15,
            [bob.id]: 3,
            [carol.id]: 6,
          },
          mean: 8,
          cv: 0.72,
          topFactor: `Alice has 15 effort pts vs avg 8`,
        },
        deadline: {
          overdueCount: 1,
          dueSoon48hCount: 2,
          dueSoon7dCount: 2,
          totalOpen: 5,
        },
        comm: {
          recentMessageCount: 4,
          recentAvgNegativity: 0.38,
          priorAvgNegativity: 0.12,
          negativitySlope: 0.26,
          confidence: 0.6,
        },
        drift: { reason: "no goal embedding — complete team charter first" },
      },
      evidencePreviewJsonb: {
        workload: "Alice has 15 effort pts vs avg 8",
        deadline: 1,
        comm: 0.26,
        drift: null,
      },
    })
    .onConflictDoUpdate({
      target: teamSignals.teamId,
      set: {
        workloadImbalance: "0.72",
        deadlineRisk: "0.61",
        communicationRisk: "0.42",
        drift: "0",
        computedAt: now,
      },
    });

  console.log("Team signals seeded.");
  console.log("\n=== Seed complete! ===");
  console.log(`Team ID: ${team.id}`);
  console.log(`\nDev login:`);
  console.log(`  Set cookie: gcp_session=${aliceToken}  (Alice)`);
  console.log(`  Set cookie: gcp_session=${bobToken}   (Bob)`);
  console.log(`\nOr POST /api/auth/login with { "email": "alice@demo.local", "displayName": "Alice Chen" }`);

  await pool.end();
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
