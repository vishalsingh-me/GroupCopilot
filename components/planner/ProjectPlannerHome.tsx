"use client";

import { type FormEvent, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BarChart3, CalendarClock, Download, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/common/use-toast";
import {
  computeMilestoneCount,
  generatePlannerSchedule,
  isValidTimeZone,
  type PlannerCadence,
} from "@/lib/project-planner";
import type { RoomMember } from "@/lib/types";

type ProjectPlanDto = {
  id: string;
  title: string;
  description: string;
  deadlineAt: string;
  cadence: PlannerCadence;
  checkInTime: string;
  timezone: string;
};

type MilestoneDto = {
  id: string;
  index: number;
  title: string;
  startAt: string;
  dueAt: string;
};

type CheckInDto = {
  id: string;
  milestoneId: string;
  scheduledAt: string;
};

type PlanResponse = {
  ok?: boolean;
  message?: string;
  warning?: string;
  emailStatus?: "sent" | "failed" | "skipped";
  schemaNotReady?: boolean;
  plan: ProjectPlanDto | null;
  milestones: MilestoneDto[];
  checkins: CheckInDto[];
};

type SavePlanPayload = {
  title: string;
  description: string;
  deadlineAt: string;
  cadence: PlannerCadence;
  checkInTime: string;
  timezone: string;
  milestoneTitles: string[];
};

type WorkloadBucket = {
  low: number;
  med: number;
  high: number;
};

type WorkloadEntry = {
  userId: string;
  name: string;
  email: string;
  completedPoints: number;
  pendingPoints: number;
  completed: WorkloadBucket;
  pending: WorkloadBucket;
};

type WorkloadResponse = {
  members: WorkloadEntry[];
  source?: "live" | "fallback";
};

type Props = {
  roomCode: string;
  members: RoomMember[];
  sessionEmail?: string | null;
  onOpenChat?: () => void;
};

type PlannerStep = 1 | 2 | 3 | 4;
type PlannerDraft = {
  step: PlannerStep;
  title: string;
  description: string;
  deadlineAt: string;
  cadence: PlannerCadence;
  checkInTime: string;
  timezone: string;
  milestoneTitles: string[];
  updatedAt: number;
};

const STEP_LABELS: Record<PlannerStep, string> = {
  1: "Basics",
  2: "Milestones",
  3: "Check-ins",
  4: "Review",
};

const WORKLOAD_BAR_PALETTE = [
  { dark: "#22c55e", light: "#bbf7d0" },
  { dark: "#ef4444", light: "#fecaca" },
  { dark: "#3b82f6", light: "#bfdbfe" },
  { dark: "#f59e0b", light: "#fde68a" },
  { dark: "#06b6d4", light: "#a5f3fc" },
  { dark: "#a855f7", light: "#e9d5ff" },
  { dark: "#ec4899", light: "#fbcfe8" },
  { dark: "#84cc16", light: "#d9f99d" },
];

function plannerDraftStorageKey(roomCode: string) {
  return `group-copilot:planner-draft:${roomCode.toUpperCase()}`;
}

function parsePlannerDraft(raw: string): PlannerDraft | null {
  try {
    const parsed = JSON.parse(raw) as Partial<PlannerDraft>;
    if (!parsed || typeof parsed !== "object") return null;
    if (parsed.step !== 1 && parsed.step !== 2 && parsed.step !== 3 && parsed.step !== 4) return null;
    if (parsed.cadence !== "daily" && parsed.cadence !== "weekly" && parsed.cadence !== "monthly") return null;
    return {
      step: parsed.step,
      title: typeof parsed.title === "string" ? parsed.title : "",
      description: typeof parsed.description === "string" ? parsed.description : "",
      deadlineAt: typeof parsed.deadlineAt === "string" ? parsed.deadlineAt : "",
      cadence: parsed.cadence,
      checkInTime: typeof parsed.checkInTime === "string" ? parsed.checkInTime : "09:00",
      timezone: typeof parsed.timezone === "string" ? parsed.timezone : "UTC",
      milestoneTitles: Array.isArray(parsed.milestoneTitles)
        ? parsed.milestoneTitles.filter((value): value is string => typeof value === "string")
        : [],
      updatedAt: typeof parsed.updatedAt === "number" ? parsed.updatedAt : Date.now(),
    };
  } catch {
    return null;
  }
}

function toDateTimeLocalInput(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatDateTime(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString();
}

function isAdminRole(role?: string | null): boolean {
  return role === "owner" || role === "admin";
}

export default function ProjectPlannerHome({ roomCode, members, sessionEmail, onOpenChat }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isDev = process.env.NODE_ENV !== "production";

  const [step, setStep] = useState<PlannerStep>(1);
  const [editing, setEditing] = useState(false);
  const [anchorNow, setAnchorNow] = useState<Date>(() => new Date());
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [deadlineAt, setDeadlineAt] = useState("");
  const [cadence, setCadence] = useState<PlannerCadence>("weekly");
  const [checkInTime, setCheckInTime] = useState("09:00");
  const [timezone, setTimezone] = useState("UTC");
  const [milestoneTitles, setMilestoneTitles] = useState<string[]>([]);
  const [draftHydrated, setDraftHydrated] = useState(false);
  const draftKey = useMemo(() => plannerDraftStorageKey(roomCode), [roomCode]);

  const currentMember = useMemo(
    () =>
      members.find(
        (member) =>
          member.email &&
          sessionEmail &&
          member.email.toLowerCase() === sessionEmail.toLowerCase()
      ),
    [members, sessionEmail]
  );
  const isAdmin = isAdminRole(currentMember?.role);

  const planQuery = useQuery({
    queryKey: ["room-plan", roomCode],
    queryFn: async () => {
      const response = await fetch(`/api/rooms/${roomCode}/plan`, {
        cache: "no-store",
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.message ?? payload?.error ?? "Failed to load project plan.");
      }
      if (payload?.schemaNotReady) {
        throw new Error(payload?.message ?? "Project planner tables are not initialized.");
      }
      return payload as PlanResponse;
    },
    enabled: Boolean(roomCode),
    retry: false,
  });
  const workloadQuery = useQuery<WorkloadResponse>({
    queryKey: ["room-workload", roomCode],
    queryFn: async () => {
      const response = await fetch(`/api/rooms/${roomCode}/tasks/workload`, {
        cache: "no-store",
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error ?? "Unable to load room workload.");
      }
      return payload as WorkloadResponse;
    },
    enabled: Boolean(roomCode),
    refetchOnWindowFocus: true,
    refetchInterval: 12000,
  });

  useEffect(() => {
    if (timezone === "UTC" && typeof window !== "undefined") {
      const browserZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (browserZone) setTimezone(browserZone);
    }
  }, [timezone]);

  const plan = planQuery.data?.plan ?? null;
  const milestones = planQuery.data?.milestones ?? [];
  const checkins = planQuery.data?.checkins ?? [];
  const hasPlan = Boolean(plan);

  const deadlineDate = useMemo(() => {
    if (!deadlineAt) return null;
    const parsed = new Date(deadlineAt);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }, [deadlineAt]);

  const milestoneCount = useMemo(() => {
    if (!deadlineDate) {
      return { count: 0, error: "Select a valid deadline." };
    }
    return computeMilestoneCount(cadence, deadlineDate, anchorNow);
  }, [cadence, deadlineDate, anchorNow]);

  useEffect(() => {
    if (milestoneCount.count <= 0) {
      setMilestoneTitles([]);
      return;
    }
    setMilestoneTitles((previous) =>
      Array.from({ length: milestoneCount.count }, (_, index) => {
        const existing = previous[index]?.trim();
        return existing && existing.length > 0 ? existing : `Milestone ${index + 1}`;
      })
    );
  }, [milestoneCount.count]);

  const preview = useMemo(() => {
    if (!deadlineDate || !checkInTime || !timezone || milestoneCount.error) return null;
    try {
      return generatePlannerSchedule({
        cadence,
        deadlineAt: deadlineDate,
        checkInTime,
        timezone,
        now: anchorNow,
        milestoneTitles,
      });
    } catch {
      return null;
    }
  }, [anchorNow, cadence, checkInTime, deadlineDate, milestoneCount.error, milestoneTitles, timezone]);

  const nextCheckIn = useMemo(() => {
    const now = Date.now();
    return checkins
      .map((checkin) => new Date(checkin.scheduledAt))
      .find((date) => date.getTime() >= now);
  }, [checkins]);

  function resetFormForNewPlan() {
    const now = new Date();
    setAnchorNow(now);
    setStep(1);
    setEditing(false);
    setTitle("");
    setDescription("");
    setDeadlineAt("");
    setCadence("weekly");
    setCheckInTime("09:00");
    setMilestoneTitles([]);
    const browserZone =
      typeof window !== "undefined"
        ? Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
        : "UTC";
    setTimezone(browserZone);
  }

  function startEditPlan() {
    if (!plan) return;
    setAnchorNow(new Date());
    setEditing(true);
    setStep(1);
    setTitle(plan.title);
    setDescription(plan.description);
    setDeadlineAt(toDateTimeLocalInput(plan.deadlineAt));
    setCadence(plan.cadence);
    setCheckInTime(plan.checkInTime);
    setTimezone(plan.timezone || "UTC");
    setMilestoneTitles(
      [...milestones]
        .sort((a, b) => a.index - b.index)
        .map((milestone) => milestone.title || `Milestone ${milestone.index}`)
    );
  }

  const savePlanMutation = useMutation({
    mutationFn: async (payloadToSave: SavePlanPayload) => {
      if (isDev) {
        console.log("[planner/save] request:start", {
          roomCode,
          step,
          cadence: payloadToSave.cadence,
          checkInTime: payloadToSave.checkInTime,
          timezone: payloadToSave.timezone,
          milestoneCount: payloadToSave.milestoneTitles.length,
        });
      }

      const response = await fetch(`/api/rooms/${roomCode}/plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payloadToSave),
      });
      const payload = await response.json().catch(() => null);
      if (isDev) {
        console.log("[planner/save] request:response", {
          roomCode,
          status: response.status,
          ok: response.ok,
          payload,
        });
      }
      if (!response.ok) {
        throw new Error(payload?.message ?? payload?.error ?? "Failed to save plan.");
      }
      return payload as PlanResponse;
    },
    onSuccess: (data) => {
      toast({ title: "Project plan saved", description: data.message ?? "Milestones and check-ins are ready." });
      if (data.emailStatus === "failed" && data.warning) {
        toast({
          title: "Email warning",
          description: data.warning,
          variant: "destructive",
        });
      }
      setEditing(false);
      setStep(1);
      queryClient.setQueryData(["room-plan", roomCode], data);
      queryClient.invalidateQueries({ queryKey: ["room-plan", roomCode] });
    },
    onError: (error: Error) => {
      toast({ title: "Unable to save plan", description: error.message, variant: "destructive" });
    },
  });

  const showForm = isAdmin && (!hasPlan || editing);
  const workloadRows = useMemo(() => {
    const byId = new Map((workloadQuery.data?.members ?? []).map((row) => [row.userId, row]));
    return members.map((member) => {
      const row = byId.get(member.id);
      return {
        userId: member.id,
        name: member.name,
        completedPoints: row?.completedPoints ?? 0,
        pendingPoints: row?.pendingPoints ?? 0,
        completed: row?.completed ?? { low: 0, med: 0, high: 0 },
        pending: row?.pending ?? { low: 0, med: 0, high: 0 },
      };
    });
  }, [members, workloadQuery.data?.members]);
  const maxWorkloadPoints = useMemo(
    () =>
      Math.max(
        1,
        ...workloadRows.map((row) => row.completedPoints + row.pendingPoints),
        ...workloadRows.map((row) => row.completedPoints)
      ),
    [workloadRows]
  );

  function canAdvanceFromStep1() {
    if (!title.trim() || !description.trim() || !deadlineDate) return false;
    if (!isValidTimeZone(timezone)) return false;
    if (milestoneCount.error) return false;
    return true;
  }

  function goNext() {
    if (step < 4) setStep((step + 1) as PlannerStep);
  }

  function goBack() {
    if (step > 1) setStep((step - 1) as PlannerStep);
  }

  function handleSavePlanSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isDev) {
      console.log("[planner/save] submit:clicked", {
        roomCode,
        step,
        hasPreview: Boolean(preview),
        isPending: savePlanMutation.isPending,
      });
    }

    if (step !== 4) return;
    if (!preview) {
      toast({ title: "Unable to save plan", description: "Preview is not ready yet.", variant: "destructive" });
      return;
    }

    const parsedDeadline = new Date(deadlineAt);
    if (Number.isNaN(parsedDeadline.getTime())) {
      toast({ title: "Unable to save plan", description: "Deadline must be a valid date-time.", variant: "destructive" });
      return;
    }

    const payload: SavePlanPayload = {
      title: title.trim(),
      description: description.trim(),
      deadlineAt: parsedDeadline.toISOString(),
      cadence,
      checkInTime,
      timezone,
      milestoneTitles,
    };

    if (isDev) {
      console.log("[planner/save] submit:payload", {
        roomCode,
        titleLength: payload.title.length,
        descriptionLength: payload.description.length,
        deadlineAt: payload.deadlineAt,
        cadence: payload.cadence,
        checkInTime: payload.checkInTime,
        timezone: payload.timezone,
        milestoneCount: payload.milestoneTitles.length,
      });
    }

    savePlanMutation.mutate(payload);
  }

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (hasPlan && !editing) {
      window.localStorage.removeItem(draftKey);
      setDraftHydrated(true);
      return;
    }

    if (planQuery.isLoading) return;

    const raw = window.localStorage.getItem(draftKey);
    if (!raw) {
      setDraftHydrated(true);
      return;
    }

    const draft = parsePlannerDraft(raw);
    if (!draft) {
      window.localStorage.removeItem(draftKey);
      setDraftHydrated(true);
      return;
    }

    if (!title.trim()) setTitle(draft.title);
    if (!description.trim()) setDescription(draft.description);
    if (!deadlineAt) setDeadlineAt(draft.deadlineAt);
    setCadence(draft.cadence);
    setCheckInTime(draft.checkInTime);
    if (timezone === "UTC" || !timezone.trim()) setTimezone(draft.timezone);
    if (milestoneTitles.length === 0 && draft.milestoneTitles.length > 0) {
      setMilestoneTitles(draft.milestoneTitles);
    }
    setStep(draft.step);
    setDraftHydrated(true);
    // Hydrate draft once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftKey, hasPlan, editing, planQuery.isLoading]);

  useEffect(() => {
    if (typeof window === "undefined" || !draftHydrated) return;
    if (!showForm) return;

    const draft: PlannerDraft = {
      step,
      title,
      description,
      deadlineAt,
      cadence,
      checkInTime,
      timezone,
      milestoneTitles,
      updatedAt: Date.now(),
    };
    window.localStorage.setItem(draftKey, JSON.stringify(draft));
  }, [
    cadence,
    checkInTime,
    deadlineAt,
    description,
    draftHydrated,
    draftKey,
    milestoneTitles,
    showForm,
    step,
    timezone,
    title,
  ]);

  const renderWorkloadCard = () => (
    <section className="rounded-xl border border-border bg-card p-5">
      <div className="mb-3">
        <p className="flex items-center gap-2 text-base font-semibold">
          <BarChart3 className="h-4 w-4 text-muted-foreground" />
          Team workload (this room)
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Lighter bar: expected after pending tasks. Darker bar: completed workload.
        </p>
      </div>

      {workloadQuery.isLoading ? (
        <p className="text-xs text-muted-foreground">Loading workload…</p>
      ) : workloadQuery.isError ? (
        <p className="text-xs text-destructive">{(workloadQuery.error as Error).message}</p>
      ) : workloadRows.length === 0 ? (
        <p className="text-xs text-muted-foreground">No member workload yet.</p>
      ) : (
        <div className="space-y-3">
          {workloadRows.map((row, index) => {
            const palette = WORKLOAD_BAR_PALETTE[index % WORKLOAD_BAR_PALETTE.length];
            const expectedPoints = row.completedPoints + row.pendingPoints;
            const expectedWidth = Math.max(
              expectedPoints > 0 ? (expectedPoints / maxWorkloadPoints) * 100 : 0,
              expectedPoints > 0 ? 2 : 0
            );
            const completedWidth = Math.max(
              row.completedPoints > 0 ? (row.completedPoints / maxWorkloadPoints) * 100 : 0,
              row.completedPoints > 0 ? 2 : 0
            );

            return (
              <div key={row.userId} className="rounded-lg border border-border/80 px-3 py-3">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold">{row.name}</p>
                  <div className="flex items-center gap-2 text-[11px] font-medium">
                    <span
                      className="rounded-full px-2 py-0.5"
                      style={{ backgroundColor: palette.dark, color: "#ffffff" }}
                    >
                      Completed {row.completedPoints}
                    </span>
                    <span
                      className="rounded-full px-2 py-0.5"
                      style={{ backgroundColor: palette.light, color: "#111827" }}
                    >
                      Expected {expectedPoints}
                    </span>
                  </div>
                </div>

                <div className="relative h-4 overflow-hidden rounded-full bg-muted/70">
                  <div
                    className="absolute inset-y-0 left-0 rounded-full transition-all duration-700 ease-out"
                    style={{
                      width: `${expectedWidth}%`,
                      backgroundColor: palette.light,
                    }}
                  />
                  <div
                    className="absolute inset-y-0 left-0 rounded-full transition-all duration-700 ease-out"
                    style={{
                      width: `${completedWidth}%`,
                      backgroundColor: palette.dark,
                      boxShadow: `0 0 18px ${palette.dark}80`,
                    }}
                  />
                </div>

                <p className="mt-2 text-xs text-muted-foreground">
                  Done: H{row.completed.high} M{row.completed.med} L{row.completed.low} | Pending: H{row.pending.high} M{row.pending.med} L{row.pending.low}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );

  if (planQuery.isLoading) {
    return (
      <div className="rounded-xl border border-border bg-card p-5">
        <p className="text-sm text-muted-foreground">Loading project planner…</p>
      </div>
    );
  }

  if (planQuery.isError) {
    return (
      <div className="rounded-xl border border-border bg-card p-5">
        <p className="text-sm font-medium">Unable to load project planner.</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {(planQuery.error as Error).message}
        </p>
      </div>
    );
  }

  if (!showForm && !hasPlan && !isAdmin) {
    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-border bg-card p-5">
          <p className="text-sm font-medium">Waiting for admin to set up the project plan.</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Once the plan is created, milestones and check-ins will appear here.
          </p>
          {onOpenChat ? (
            <Button variant="outline" className="mt-3" onClick={onOpenChat}>
              Open chat
            </Button>
          ) : null}
        </div>
        {renderWorkloadCard()}
      </div>
    );
  }

  if (!showForm && hasPlan && plan) {
    const orderedMilestones = [...milestones].sort((a, b) => a.index - b.index);
    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase text-muted-foreground">Project Planner</p>
              <h2 className="text-xl font-semibold">{plan.title}</h2>
              <p className="mt-1 text-sm text-muted-foreground whitespace-pre-wrap">{plan.description}</p>
            </div>
            <div className="flex items-center gap-2">
              <a href={`/api/rooms/${roomCode}/calendar.ics`}>
                <Button variant="outline" size="sm">
                  <Download className="mr-1.5 h-4 w-4" />
                  Download calendar (.ics)
                </Button>
              </a>
              {isAdmin ? (
                <Button size="sm" onClick={startEditPlan}>
                  <Pencil className="mr-1.5 h-4 w-4" />
                  Edit plan
                </Button>
              ) : null}
            </div>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-border bg-muted/30 p-3">
              <p className="text-xs text-muted-foreground">Deadline</p>
              <p className="text-sm font-medium">{formatDateTime(plan.deadlineAt)}</p>
            </div>
            <div className="rounded-lg border border-border bg-muted/30 p-3">
              <p className="text-xs text-muted-foreground">Cadence</p>
              <p className="text-sm font-medium capitalize">{plan.cadence}</p>
            </div>
            <div className="rounded-lg border border-border bg-muted/30 p-3">
              <p className="text-xs text-muted-foreground">Next check-in</p>
              <p className="text-sm font-medium">{nextCheckIn ? formatDateTime(nextCheckIn) : "No upcoming check-ins"}</p>
            </div>
          </div>

          <div className="mt-4 space-y-2">
            <p className="text-sm font-semibold">Milestones</p>
            {orderedMilestones.length === 0 ? (
              <p className="text-xs text-muted-foreground">No milestones generated yet.</p>
            ) : (
              orderedMilestones.map((milestone) => (
                <div key={milestone.id} className="rounded-lg border border-border px-3 py-2">
                  <p className="text-sm font-medium">
                    {milestone.index}. {milestone.title}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatDateTime(milestone.startAt)} → {formatDateTime(milestone.dueAt)}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>
        {renderWorkloadCard()}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <form className="rounded-xl border border-border bg-card p-5" onSubmit={handleSavePlanSubmit}>
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase text-muted-foreground">Project Planner</p>
            <h2 className="text-lg font-semibold">{hasPlan ? "Edit project plan" : "Set up project plan"}</h2>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <CalendarClock className="h-4 w-4" />
            Step {step} of 4: {STEP_LABELS[step]}
          </div>
        </div>

      <div className="mt-4 space-y-4">
        {step === 1 ? (
          <>
            <div className="space-y-2">
              <label className="text-sm font-medium">Project title</label>
              <Input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Group project title"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Project description</label>
              <Textarea
                rows={4}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Describe goals, constraints, and scope."
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium">Deadline</label>
                <Input
                  type="datetime-local"
                  value={deadlineAt}
                  onChange={(event) => setDeadlineAt(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Cadence</label>
                <select
                  value={cadence}
                  onChange={(event) => setCadence(event.target.value as PlannerCadence)}
                  className="h-10 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                </select>
              </div>
            </div>
            {milestoneCount.error ? (
              <p className="text-xs text-destructive">{milestoneCount.error}</p>
            ) : null}
          </>
        ) : null}

        {step === 2 ? (
          <>
            <p className="text-sm text-muted-foreground">
              {milestoneCount.count} milestone(s) generated based on cadence and deadline.
            </p>
            <div className="space-y-2">
              {milestoneTitles.map((value, index) => (
                <div key={index} className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Milestone {index + 1}</label>
                  <Input
                    value={value}
                    onChange={(event) => {
                      const next = [...milestoneTitles];
                      next[index] = event.target.value;
                      setMilestoneTitles(next);
                    }}
                    placeholder={`Milestone ${index + 1}`}
                  />
                </div>
              ))}
            </div>
          </>
        ) : null}

        {step === 3 ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium">Check-in time</label>
                <Input type="time" value={checkInTime} onChange={(event) => setCheckInTime(event.target.value)} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Timezone</label>
                <Input value={timezone} onChange={(event) => setTimezone(event.target.value)} placeholder="America/New_York" />
              </div>
            </div>
            {!isValidTimeZone(timezone) ? (
              <p className="text-xs text-destructive">Timezone must be a valid IANA string (example: America/New_York).</p>
            ) : null}
            <div>
              <p className="text-sm font-medium">Preview check-in dates</p>
              <ul className="mt-2 space-y-1">
                {(preview?.checkIns ?? []).map((checkIn) => (
                  <li key={checkIn.milestoneIndex} className="text-xs text-muted-foreground">
                    Milestone {checkIn.milestoneIndex}: {formatDateTime(checkIn.scheduledAt)}
                  </li>
                ))}
              </ul>
            </div>
          </>
        ) : null}

        {step === 4 ? (
          <>
            <div className="space-y-1 text-sm">
              <p><span className="font-medium">Title:</span> {title || "—"}</p>
              <p><span className="font-medium">Deadline:</span> {deadlineDate ? formatDateTime(deadlineDate) : "—"}</p>
              <p><span className="font-medium">Cadence:</span> <span className="capitalize">{cadence}</span></p>
              <p><span className="font-medium">Check-in:</span> {checkInTime} ({timezone})</p>
            </div>
            <div>
              <p className="text-sm font-medium">Milestones to save</p>
              <ul className="mt-1 space-y-1">
                {(preview?.milestones ?? []).map((milestone) => (
                  <li key={milestone.index} className="text-xs text-muted-foreground">
                    {milestone.index}. {milestone.title} ({formatDateTime(milestone.startAt)} → {formatDateTime(milestone.dueAt)})
                  </li>
                ))}
              </ul>
            </div>
          </>
        ) : null}
      </div>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" onClick={goBack} disabled={step === 1}>
              Back
            </Button>
            <Button
              type="button"
              onClick={goNext}
              disabled={
                (step === 1 && !canAdvanceFromStep1()) ||
                (step === 2 && milestoneCount.count === 0) ||
                (step === 3 && (!checkInTime || !isValidTimeZone(timezone) || !preview)) ||
                step === 4
              }
            >
              Next
            </Button>
          </div>
          <div className="flex items-center gap-2">
            {hasPlan ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setEditing(false);
                  setStep(1);
                  resetFormForNewPlan();
                }}
              >
                Cancel
              </Button>
            ) : null}
            <Button
              type="submit"
              disabled={step !== 4 || savePlanMutation.isPending || !preview}
            >
              {savePlanMutation.isPending ? "Saving…" : "Save plan"}
            </Button>
          </div>
        </div>
      </form>
      {renderWorkloadCard()}
    </div>
  );
}
