"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Sidebar from "@/components/layout/Sidebar";
import Topbar from "@/components/layout/Topbar";
import RightPanel from "@/components/layout/RightPanel";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/common/use-toast";
import { useRoomStore } from "@/lib/store";

type MemberOption = {
  userId: string;
  name: string;
  email: string;
  isAdmin: boolean;
};

type PlanMilestone = {
  id: string;
  index: number;
  dueAt: string;
};

type PlanResponse = {
  plan: { id: string } | null;
  milestones: PlanMilestone[];
};

type CreatedCard = {
  id: string;
  title: string;
  url: string;
};

type Priority = "" | "low" | "med" | "high";

type AssigneeSuggestionResponse = {
  suggestedUserId: string;
  suggestedUser: {
    userId: string;
    name: string;
    email: string;
  };
  rationale: string;
  fairnessPreview: {
    before: Array<{ userId: string; points: number }>;
    after: Array<{ userId: string; points: number }>;
    objective: "minimize_range";
  };
};

function PanelParamReader({ onPanelDetected }: { onPanelDetected?: () => void }) {
  const searchParams = useSearchParams();
  const panel = searchParams.get("panel");
  const { panelTab, setPanelTab } = useRoomStore();
  useEffect(() => {
    if (panel === "plan" || panel === "trello" || panel === "guide" || panel === "activity") {
      if (panel !== panelTab) setPanelTab(panel);
      onPanelDetected?.();
    }
  }, [onPanelDetected, panel, panelTab, setPanelTab]);
  return null;
}

export default function AdminTasksPage({ roomCode }: { roomCode: string }) {
  const params = useParams<{ code: string }>();
  const code = params.code ?? roomCode;
  const router = useRouter();
  const { data: session, status } = useSession();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { setRoom } = useRoomStore();

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [mobilePanelOpen, setMobilePanelOpen] = useState(false);
  const [desktopPanelOpen, setDesktopPanelOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<Priority>("");
  const [assignedUserId, setAssignedUserId] = useState("");
  const [recentCards, setRecentCards] = useState<CreatedCard[]>([]);
  const [assigneeOverridden, setAssigneeOverridden] = useState(false);
  const [suggestion, setSuggestion] = useState<AssigneeSuggestionResponse | null>(null);
  const [suggestionError, setSuggestionError] = useState<string | null>(null);
  const [isSuggesting, setIsSuggesting] = useState(false);
  const openDesktopPanel = useCallback(() => setDesktopPanelOpen(true), []);
  const assigneeOverrideRef = useRef(false);

  useEffect(() => {
    assigneeOverrideRef.current = assigneeOverridden;
  }, [assigneeOverridden]);

  useQuery({
    queryKey: ["room", code],
    queryFn: async () => {
      const res = await fetch(`/api/rooms/${code}`);
      if (!res.ok) throw new Error("Failed to load room");
      const data = await res.json();
      setRoom(data.room);
      return data.room;
    },
    enabled: status === "authenticated",
  });

  const membersQuery = useQuery({
    queryKey: ["room-members", code],
    queryFn: async () => {
      const response = await fetch(`/api/rooms/${code}/members`);
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error ?? "Failed to load room members.");
      }
      return (payload?.members ?? []) as MemberOption[];
    },
    enabled: status === "authenticated",
    retry: false,
  });

  const planQuery = useQuery({
    queryKey: ["room-plan", code, "tasks-page"],
    queryFn: async () => {
      const response = await fetch(`/api/rooms/${code}/plan`);
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.message ?? payload?.error ?? "Failed to load project plan.");
      }
      return payload as PlanResponse;
    },
    enabled: status === "authenticated",
    retry: false,
  });

  const members = membersQuery.data ?? [];
  const selectedMember = members.find((member) => member.userId === assignedUserId) ?? null;
  const memberNameMap = useMemo(
    () => new Map(members.map((member) => [member.userId, member.name])),
    [members]
  );

  const milestoneInfo = useMemo(() => {
    const milestones = planQuery.data?.milestones ?? [];
    if (milestones.length === 0) {
      return {
        index: 1,
        warning: "Project plan not set; defaulting to Milestone 1.",
      };
    }

    const sorted = [...milestones].sort((a, b) => a.index - b.index);
    const now = Date.now();
    const active = sorted.find((milestone) => {
      const dueTime = new Date(milestone.dueAt).getTime();
      return !Number.isNaN(dueTime) && dueTime >= now;
    });

    return {
      index: active?.index ?? sorted[sorted.length - 1]?.index ?? 1,
      warning: null as string | null,
    };
  }, [planQuery.data?.milestones]);

  const createTaskMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/rooms/${code}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          description,
          priority,
          assignedUserId,
          milestoneIndex: milestoneInfo.index,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error ?? "Failed to create task.");
      }
      return payload as { card: CreatedCard };
    },
    onSuccess: (payload) => {
      setRecentCards((previous) => [payload.card, ...previous].slice(0, 6));
      setTitle("");
      setDescription("");
      setPriority("");
      setAssignedUserId("");
      setAssigneeOverridden(false);
      setSuggestion(null);
      setSuggestionError(null);
      queryClient.invalidateQueries({ queryKey: ["room-workload", code] });
      toast({
        title: "Task created",
        description: "The Trello task was created successfully.",
      });
    },
    onError: (error) => {
      toast({
        title: "Task creation failed",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    },
  });

  const canSubmit =
    title.trim().length > 0 &&
    priority !== "" &&
    assignedUserId.trim().length > 0 &&
    !createTaskMutation.isPending &&
    !membersQuery.isLoading;

  useEffect(() => {
    if (!priority) {
      setSuggestion(null);
      setSuggestionError(null);
      setIsSuggesting(false);
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setIsSuggesting(true);
      setSuggestionError(null);
      try {
        const response = await fetch(`/api/rooms/${code}/tasks/suggest-assignee`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            priority,
            milestoneIndex: milestoneInfo.index,
          }),
          signal: controller.signal,
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(payload?.error ?? "Unable to suggest assignee.");
        }

        if (controller.signal.aborted) return;
        const suggestionPayload = payload as AssigneeSuggestionResponse;
        setSuggestion(suggestionPayload);
        if (!assigneeOverrideRef.current) {
          setAssignedUserId(suggestionPayload.suggestedUserId);
        }
      } catch (error) {
        if (controller.signal.aborted) return;
        setSuggestion(null);
        setSuggestionError(error instanceof Error ? error.message : "Unable to suggest assignee.");
      } finally {
        if (!controller.signal.aborted) {
          setIsSuggesting(false);
        }
      }
    }, 300);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [code, milestoneInfo.index, priority]);

  if (status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">Loading your session...</p>
      </div>
    );
  }

  if (status === "unauthenticated") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background p-6 text-center">
        <p className="text-sm font-medium">You are not signed in.</p>
        <p className="text-xs text-muted-foreground">Sign in to continue.</p>
        <Button onClick={() => router.push("/")}>Go to Sign In</Button>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-background">
      <Suspense fallback={null}>
        <PanelParamReader onPanelDetected={openDesktopPanel} />
      </Suspense>

      <Topbar
        onOpenSidebar={() => setSidebarOpen(true)}
        onTogglePanel={() => setDesktopPanelOpen((open) => !open)}
        onOpenMobilePanel={() => setMobilePanelOpen(true)}
        panelOpen={desktopPanelOpen}
      />

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex min-h-0 flex-1 flex-col">
          <div className="mx-auto flex min-h-0 w-full max-w-4xl flex-1 flex-col px-4 pb-4 pt-3">
            <section className="mb-4 rounded-xl border border-border/70 bg-card/70 p-4">
              <h1 className="text-lg font-semibold">Create a Task</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Create manual Trello tasks for your team and assign them to room members.
              </p>
            </section>

            <section className="rounded-xl border border-border/70 bg-card/60 p-4">
              <form
                className="space-y-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (!canSubmit) return;
                  createTaskMutation.mutate();
                }}
              >
                <div className="space-y-1.5">
                  <label htmlFor="task-title" className="text-sm font-medium">
                    Task name
                  </label>
                  <Input
                    id="task-title"
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    placeholder="Build weekly review summary endpoint"
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="task-description" className="text-sm font-medium">
                    Brief description
                  </label>
                  <Textarea
                    id="task-description"
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    rows={4}
                    placeholder="Optional implementation notes."
                  />
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-1.5">
                    <label htmlFor="task-milestone" className="text-sm font-medium">
                      Milestone number
                    </label>
                    <Input
                      id="task-milestone"
                      value={String(milestoneInfo.index)}
                      readOnly
                      disabled
                    />
                    {milestoneInfo.warning ? (
                      <p className="text-xs text-amber-600 dark:text-amber-300">
                        {milestoneInfo.warning}
                      </p>
                    ) : null}
                  </div>

                  <div className="space-y-1.5">
                    <label htmlFor="task-priority" className="text-sm font-medium">
                      Priority
                    </label>
                  <select
                    id="task-priority"
                    value={priority}
                    onChange={(event) => setPriority(event.target.value as Priority)}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    required
                  >
                      <option value="">Select priority</option>
                      <option value="low">Low</option>
                      <option value="med">Medium</option>
                      <option value="high">High</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="task-assignee" className="text-sm font-medium">
                    Person assigned
                  </label>
                  <select
                    id="task-assignee"
                    value={assignedUserId}
                    onChange={(event) => {
                      setAssignedUserId(event.target.value);
                      setAssigneeOverridden(true);
                    }}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    required
                    disabled={membersQuery.isLoading}
                  >
                    <option value="">
                      {membersQuery.isLoading ? "Loading members..." : "Select member"}
                    </option>
                    {members.map((member) => (
                      <option key={member.userId} value={member.userId}>
                        {member.name}
                      </option>
                    ))}
                  </select>
                  {selectedMember ? (
                    <p className="text-xs text-muted-foreground">
                      Selected: {selectedMember.name} ({selectedMember.email})
                    </p>
                  ) : null}
                </div>

                {priority ? (
                  <div className="rounded-lg border border-border/70 bg-card/40 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Suggested assignee
                    </p>
                    {isSuggesting ? (
                      <p className="mt-2 text-sm text-muted-foreground">Calculating fair assignment...</p>
                    ) : suggestion ? (
                      <div className="mt-2 space-y-2">
                        <p className="text-sm font-medium">
                          {suggestion.suggestedUser.name} ({suggestion.suggestedUser.email})
                        </p>
                        <p className="text-xs text-muted-foreground">{suggestion.rationale}</p>
                        <div className="grid gap-3 text-xs md:grid-cols-2">
                          <div>
                            <p className="mb-1 font-medium text-muted-foreground">Before assignment</p>
                            <div className="space-y-0.5">
                              {suggestion.fairnessPreview.before.map((item) => (
                                <p key={`before-${item.userId}`}>
                                  {memberNameMap.get(item.userId) ?? item.userId}: {item.points}
                                </p>
                              ))}
                            </div>
                          </div>
                          <div>
                            <p className="mb-1 font-medium text-muted-foreground">Projected after assignment</p>
                            <div className="space-y-0.5">
                              {suggestion.fairnessPreview.after.map((item) => (
                                <p key={`after-${item.userId}`}>
                                  {memberNameMap.get(item.userId) ?? item.userId}: {item.points}
                                </p>
                              ))}
                            </div>
                          </div>
                        </div>
                        {assigneeOverridden && suggestion.suggestedUserId !== assignedUserId ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setAssignedUserId(suggestion.suggestedUserId);
                              setAssigneeOverridden(false);
                            }}
                          >
                            Use suggestion
                          </Button>
                        ) : null}
                      </div>
                    ) : (
                      <p className="mt-2 text-sm text-muted-foreground">
                        Suggestion unavailable right now.
                      </p>
                    )}
                    {suggestionError ? (
                      <p className="mt-2 text-xs text-destructive">{suggestionError}</p>
                    ) : null}
                  </div>
                ) : null}

                {membersQuery.isError ? (
                  <p className="text-sm text-destructive">
                    {(membersQuery.error as Error).message}
                  </p>
                ) : null}

                {planQuery.isError ? (
                  <p className="text-sm text-amber-600 dark:text-amber-300">
                    {(planQuery.error as Error).message}
                  </p>
                ) : null}

                <Button type="submit" disabled={!canSubmit}>
                  {createTaskMutation.isPending ? "Creating task..." : "Create task"}
                </Button>
              </form>
            </section>

            {recentCards.length > 0 ? (
              <section className="mt-4 rounded-xl border border-border/70 bg-card/50 p-4">
                <h2 className="text-sm font-semibold">Recently created tasks</h2>
                <div className="mt-3 space-y-2">
                  {recentCards.map((card) => (
                    <a
                      key={card.id}
                      href={card.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block rounded-lg border border-border/60 bg-background px-3 py-2 text-sm hover:bg-accent/30"
                    >
                      {card.title}
                    </a>
                  ))}
                </div>
              </section>
            ) : null}
          </div>
        </main>

        {desktopPanelOpen ? (
          <RightPanel className="hidden lg:flex" onClose={() => setDesktopPanelOpen(false)} />
        ) : null}
      </div>

      <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
        <SheetTrigger asChild>
          <div />
        </SheetTrigger>
        <SheetContent side="left" className="p-0">
          <Sidebar className="flex w-full" />
        </SheetContent>
      </Sheet>

      <Sheet open={mobilePanelOpen} onOpenChange={setMobilePanelOpen}>
        <SheetTrigger asChild>
          <div />
        </SheetTrigger>
        <SheetContent side="right" className="p-0">
          <div className="h-full">
            <RightPanel className="flex h-full w-full" onClose={() => setMobilePanelOpen(false)} />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
