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

type RoomMemberOption = {
  userId: string;
  name: string;
  email: string;
  isAdmin: boolean;
};

type MembersResponse = {
  members: RoomMemberOption[];
  isAdmin: boolean;
};

type PlanResponse = {
  plan: { id: string } | null;
  milestones: Array<{ id: string; index: number; startAt: string; dueAt: string }>;
};

type SuggestionResponse = {
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
      if (panel !== panelTab) {
        setPanelTab(panel);
      }
      onPanelDetected?.();
    }
  }, [onPanelDetected, panel, panelTab, setPanelTab]);

  return null;
}

function getMilestoneIndex(milestones: PlanResponse["milestones"]): number {
  if (!milestones.length) return 1;
  const now = Date.now();
  const ordered = [...milestones].sort((a, b) => a.index - b.index);

  const active = ordered.find((milestone) => {
    const start = new Date(milestone.startAt).getTime();
    const due = new Date(milestone.dueAt).getTime();
    return start <= now && now <= due;
  });
  if (active) return active.index;

  const next = ordered.find((milestone) => new Date(milestone.dueAt).getTime() >= now);
  if (next) return next.index;

  return ordered[ordered.length - 1]?.index ?? 1;
}

export default function RoomTasksPage() {
  const params = useParams<{ code: string }>();
  const code = params.code;
  const router = useRouter();
  const { data: session, status } = useSession();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { setRoom } = useRoomStore();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<"low" | "med" | "high" | "">("");
  const [assignedUserId, setAssignedUserId] = useState("");
  const [suggestionError, setSuggestionError] = useState<string | null>(null);
  const [suggestion, setSuggestion] = useState<SuggestionResponse | null>(null);
  const assigneeOverriddenRef = useRef(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [mobilePanelOpen, setMobilePanelOpen] = useState(false);
  const [desktopPanelOpen, setDesktopPanelOpen] = useState(false);
  const openDesktopPanel = useCallback(() => setDesktopPanelOpen(true), []);

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

  const membersQuery = useQuery<MembersResponse>({
    queryKey: ["room-members", code],
    queryFn: async () => {
      const response = await fetch(`/api/rooms/${code}/members`);
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error ?? "Unable to load room members.");
      }
      return payload as MembersResponse;
    },
    enabled: status === "authenticated",
  });

  const planQuery = useQuery<PlanResponse>({
    queryKey: ["room-plan", code],
    queryFn: async () => {
      const response = await fetch(`/api/rooms/${code}/plan`, {
        cache: "no-store",
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.message ?? payload?.error ?? "Unable to load project plan.");
      }
      return payload as PlanResponse;
    },
    enabled: status === "authenticated",
  });

  const milestoneIndex = useMemo(
    () => getMilestoneIndex(planQuery.data?.milestones ?? []),
    [planQuery.data?.milestones]
  );
  const selectedMember = useMemo(
    () => membersQuery.data?.members.find((member) => member.userId === assignedUserId),
    [assignedUserId, membersQuery.data?.members]
  );
  const roomMembers = membersQuery.data?.members ?? [];
  const singleMember = roomMembers.length === 1 ? roomMembers[0] : null;
  const canSubmit = Boolean(title.trim() && priority && assignedUserId);

  const createTaskMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/rooms/${code}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || undefined,
          priority,
          assignedUserId,
          milestoneIndex,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error ?? "Unable to create task.");
      }
      return payload as { card: { id: string; title: string } };
    },
    onSuccess: () => {
      toast({ title: "Task created", description: "The task was sent to Trello." });
      setTitle("");
      setDescription("");
      setPriority("");
      setAssignedUserId("");
      assigneeOverriddenRef.current = false;
      setSuggestion(null);
      setSuggestionError(null);
      queryClient.invalidateQueries({ queryKey: ["room-workload", code] });
    },
    onError: (error) => {
      toast({
        title: "Task creation failed",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    },
  });
  const suggestAssigneeMutation = useMutation({
    mutationFn: async () => {
      if (!priority) return null;
      const response = await fetch(`/api/rooms/${code}/tasks/suggest-assignee`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          priority,
          milestoneIndex,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error ?? "Unable to suggest assignee.");
      }
      return payload as SuggestionResponse;
    },
    onSuccess: (payload) => {
      if (!payload) return;
      setSuggestion(payload);
      setSuggestionError(null);
      if (!assigneeOverriddenRef.current) {
        setAssignedUserId(payload.suggestedUserId);
      }
    },
    onError: (error) => {
      setSuggestion(null);
      setSuggestionError(error instanceof Error ? error.message : "Unable to suggest assignee.");
    },
  });

  useEffect(() => {
    if (!priority || !membersQuery.data?.isAdmin) {
      setSuggestion(null);
      setSuggestionError(null);
      return;
    }

    if (singleMember) {
      const nextSuggestion: SuggestionResponse = {
        suggestedUserId: singleMember.userId,
        suggestedUser: singleMember,
        rationale: `${singleMember.name} is currently the only room member.`,
        fairnessPreview: {
          before: [{ userId: singleMember.userId, points: 0 }],
          after: [
            {
              userId: singleMember.userId,
              points: priority === "high" ? 3 : priority === "med" ? 2 : 1,
            },
          ],
          objective: "minimize_range",
        },
      };
      setSuggestion((current) =>
        current?.suggestedUserId === nextSuggestion.suggestedUserId &&
        current?.rationale === nextSuggestion.rationale
          ? current
          : nextSuggestion
      );
      if (!assigneeOverriddenRef.current) {
        setAssignedUserId(singleMember.userId);
      }
      setSuggestionError(null);
      return;
    }

    const timer = window.setTimeout(() => {
      suggestAssigneeMutation.mutate();
    }, 120);
    return () => window.clearTimeout(timer);
  }, [
    code,
    milestoneIndex,
    priority,
    membersQuery.data?.isAdmin,
    roomMembers.length,
    singleMember?.userId,
    singleMember?.name,
    singleMember?.email,
  ]);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/");
    }
  }, [router, status]);

  if (status !== "authenticated") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">Checking your session...</p>
      </div>
    );
  }

  if (membersQuery.isLoading || planQuery.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">Loading task tools...</p>
      </div>
    );
  }

  if (membersQuery.isError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6">
        <p className="text-sm text-destructive">{(membersQuery.error as Error).message}</p>
      </div>
    );
  }

  if (membersQuery.data && !membersQuery.data.isAdmin) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background p-6 text-center">
        <p className="text-sm font-medium">Only room admins can access Tasks.</p>
        <Button variant="outline" onClick={() => router.push(`/room/${code}`)}>
          Back to room
        </Button>
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
            <section className="rounded-xl border border-border bg-card p-5">
              <h1 className="text-lg font-semibold">Create a Task</h1>
              <p className="mt-1 text-xs text-muted-foreground">
                Create a Trello card manually for this room.
              </p>

              <form
                className="mt-4 space-y-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (!canSubmit || createTaskMutation.isPending) return;
                  createTaskMutation.mutate();
                }}
              >
                <div className="space-y-2">
                  <label className="text-sm font-medium">Task name</label>
                  <Input
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    placeholder="Implement homepage hero section"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Brief description (optional)</label>
                  <Textarea
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    rows={4}
                    placeholder="Include context or acceptance notes."
                  />
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Milestone number</label>
                    <Input value={`M${milestoneIndex}`} readOnly />
                    {!planQuery.data?.plan ? (
                      <p className="text-xs text-amber-600 dark:text-amber-400">
                        Project plan not set; defaulting to Milestone 1.
                      </p>
                    ) : null}
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">Priority</label>
                    <select
                      value={priority}
                      onChange={(event) => {
                        setPriority(event.target.value as "low" | "med" | "high" | "");
                      }}
                      className="h-10 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
                    >
                      <option value="">Select priority</option>
                      <option value="low">Low</option>
                      <option value="med">Med</option>
                      <option value="high">High</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Person assigned</label>
                  <select
                    value={assignedUserId}
                    onChange={(event) => {
                      setAssignedUserId(event.target.value);
                      assigneeOverriddenRef.current = true;
                    }}
                    className="h-10 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
                  >
                    <option value="">Select a member</option>
                    {(membersQuery.data?.members ?? []).map((member) => (
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
                  <div className="rounded-lg border border-border/80 bg-muted/20 p-3">
                    <p className="text-xs uppercase text-muted-foreground">Suggested assignee</p>
                    {suggestAssigneeMutation.isPending ? (
                      <p className="mt-1 text-sm text-muted-foreground">Analyzing workload…</p>
                    ) : suggestionError ? (
                      <p className="mt-1 text-sm text-destructive">{suggestionError}</p>
                    ) : suggestion ? (
                      <div className="mt-1 space-y-2">
                        <p className="text-sm font-medium">
                          {suggestion.suggestedUser.name} ({suggestion.suggestedUser.email})
                        </p>
                        <p className="text-xs text-muted-foreground">{suggestion.rationale}</p>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setAssignedUserId(suggestion.suggestedUserId);
                            assigneeOverriddenRef.current = false;
                          }}
                        >
                          Use suggestion
                        </Button>
                      </div>
                    ) : (
                      <p className="mt-1 text-sm text-muted-foreground">No suggestion yet.</p>
                    )}
                  </div>
                ) : null}

                <Button type="submit" disabled={!canSubmit || createTaskMutation.isPending}>
                  {createTaskMutation.isPending ? "Creating..." : "Create task in Trello"}
                </Button>
              </form>
            </section>

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
