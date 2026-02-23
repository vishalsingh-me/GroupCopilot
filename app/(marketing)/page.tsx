"use client";

import Image from "next/image";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession, signIn } from "next-auth/react";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/components/common/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import UserMenu from "@/components/user-menu";
import ThemeToggle from "@/components/layout/ThemeToggle";
import { useRoomStore } from "@/lib/store";

type MyRoom = {
  id: string;
  code: string;
  name?: string | null;
  role?: string | null;
};

export default function MarketingPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const { toast } = useToast();
  const { setRoom } = useRoomStore();
  const [open, setOpen] = useState<"create" | "join" | null>(null);
  const [roomName, setRoomName] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const getSignInCallbackUrl = () =>
    typeof window === "undefined" ? "/" : `${window.location.origin}/`;

  const myRoomsQuery = useQuery({
    queryKey: ["my-rooms"],
    queryFn: async () => {
      const response = await fetch("/api/rooms/mine");
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error ?? "Unable to load your rooms.");
      }
      return (payload?.rooms ?? []) as MyRoom[];
    },
    enabled: status === "authenticated",
  });

  const ensureSignedIn = async () => {
    if (status === "loading") {
      return false;
    }
    if (status === "unauthenticated") {
      await signIn("google", { callbackUrl: getSignInCallbackUrl() });
      return false;
    }
    return true;
  };

  const handleCreate = async () => {
    if (!(await ensureSignedIn())) return;
    setLoading(true);
    try {
      const response = await fetch("/api/rooms", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: roomName || undefined })
      });
      if (response.status === 401) {
        await signIn("google", { callbackUrl: getSignInCallbackUrl() });
        return;
      }
      if (!response.ok) {
        toast({
          title: "Unable to create room",
          description: await getErrorMessage(response, "Please try again.")
        });
        return;
      }
      const data = await response.json();
      setRoom(data.room);
      router.push(`/room/${data.room.code}`);
    } finally {
      setLoading(false);
    }
  };

  const handleJoin = async () => {
    if (!(await ensureSignedIn())) return;
    if (!code.trim()) return;
    setLoading(true);
    try {
      const response = await fetch("/api/rooms/join", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code })
      });
      if (response.status === 401) {
        await signIn("google", { callbackUrl: getSignInCallbackUrl() });
        return;
      }
      if (!response.ok) {
        toast({
          title: "Unable to join room",
          description: await getErrorMessage(response, "Check the room code and try again.")
        });
        return;
      }
      const data = await response.json();
      setRoom(data.room);
      router.push(`/room/${data.room.code}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="h-screen overflow-hidden bg-background">
      <div className="h-full bg-mesh-light dark:bg-mesh-dark">
        <div className="mx-auto flex h-full w-full max-w-6xl flex-col px-4 py-6 sm:px-6 sm:py-8 lg:px-8 lg:py-10">
          <div className="flex min-h-0 flex-1 flex-col gap-6 lg:gap-8">
            <header className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
              <div className="flex min-w-0 items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border/70 bg-card/80">
                  <Image
                    src="/group-copilot-logo.svg"
                    alt="Group Copilot logo"
                    width={24}
                    height={24}
                    priority
                  />
                </div>
                <div className="min-w-0">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Group Copilot</p>
                  <h1 className="max-w-4xl text-balance text-3xl font-semibold tracking-tight lg:text-5xl">
                    Collaborate smarter with a shared AI copilot.
                  </h1>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 sm:gap-3 xl:justify-end">
                <UserMenu />
                <Badge variant="accent">Education Collaboration</Badge>
                <ThemeToggle />
              </div>
            </header>

            <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <Card className="h-auto">
                <CardHeader>
                  <CardTitle>Create a room</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    Start a new shared space and invite your team.
                  </p>
                </CardHeader>
                <CardContent>
                  <Button
                    size="lg"
                    onClick={() => setOpen("create")}
                    disabled={status === "loading"}
                  >
                    Create room
                  </Button>
                </CardContent>
              </Card>
              <Card className="h-auto">
                <CardHeader>
                  <CardTitle>Join with a code</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    Already have a room code? Join in seconds.
                  </p>
                </CardHeader>
                <CardContent>
                  <Button
                    variant="secondary"
                    size="lg"
                    onClick={() => setOpen("join")}
                    disabled={status === "loading"}
                  >
                    Join room
                  </Button>
                </CardContent>
              </Card>
            </section>

            {session ? (
              <section className="flex min-h-0 flex-1 flex-col rounded-2xl border border-border bg-card/80 p-6 shadow-soft">
                <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <h2 className="text-lg font-semibold">Your rooms</h2>
                    <p className="text-sm text-muted-foreground">
                      Open an existing room or create a new one.
                    </p>
                  </div>
                  <Button onClick={() => setOpen("create")} disabled={loading}>
                    Create room
                  </Button>
                </div>

                {myRoomsQuery.isLoading ? (
                  <p className="text-sm text-muted-foreground">Loading rooms...</p>
                ) : myRoomsQuery.isError ? (
                  <p className="text-sm text-destructive">
                    {(myRoomsQuery.error as Error).message}
                  </p>
                ) : (myRoomsQuery.data ?? []).length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    You are not in any rooms yet. Create one or join by code.
                  </p>
                ) : (
                  <div className="min-h-0 flex-1 overflow-y-scroll pr-2 scrollbar-visible">
                    <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
                      {(myRoomsQuery.data ?? []).map((room) => (
                        <button
                          key={room.id}
                          type="button"
                          onClick={() => router.push(`/room/${room.code}`)}
                          className="h-auto overflow-hidden rounded-xl border border-border bg-background p-5 text-left transition hover:border-primary/40 hover:bg-accent/30"
                        >
                          <p className="truncate text-lg font-semibold leading-tight">
                            {room.name?.trim() || "Untitled room"}
                          </p>
                          <p className="mt-2 font-mono text-xs text-muted-foreground">{room.code}</p>
                          <p className="mt-3 text-sm text-muted-foreground capitalize break-words">
                            Role: {room.role ?? "member"}
                          </p>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </section>
            ) : null}

            {!session ? (
              <section className="mt-2 grid grid-cols-1 gap-6 rounded-2xl border border-border bg-card/80 p-6 shadow-soft lg:grid-cols-3">
                <div>
                  <h2 className="text-lg font-semibold">Proactive facilitation</h2>
                  <p className="text-sm text-muted-foreground">
                    The assistant asks clarifying questions and keeps the team aligned.
                  </p>
                </div>
                <div>
                  <h2 className="text-lg font-semibold">Planner + group chat</h2>
                  <p className="text-sm text-muted-foreground">
                    Keep plans and team communication in one shared workspace.
                  </p>
                </div>
                <div>
                  <h2 className="text-lg font-semibold">Conflict support</h2>
                  <p className="text-sm text-muted-foreground">
                    Use a lightweight guide and scripts to resolve tension early.
                  </p>
                </div>
              </section>
            ) : null}
          </div>
        </div>
      </div>

      <Dialog open={open !== null} onOpenChange={() => setOpen(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{open === "create" ? "Create a room" : "Join a room"}</DialogTitle>
          </DialogHeader>
          <div className="mt-4 grid gap-4">
            {open === "create" ? (
              <div className="grid gap-2">
                <label className="text-sm font-medium">Room name (optional)</label>
                <Input value={roomName} onChange={(event) => setRoomName(event.target.value)} />
              </div>
            ) : (
              <div className="grid gap-2">
                <label className="text-sm font-medium">Room code</label>
                <Input value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} />
              </div>
            )}
            <Button
              onClick={open === "create" ? handleCreate : handleJoin}
              disabled={loading || status === "loading"}
            >
              {loading ? "Working..." : "Continue"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </main>
  );
}

async function getErrorMessage(response: Response, fallback: string) {
  const payload = await response.json().catch(() => null);
  if (payload && typeof payload === "object") {
    const message = (payload as { message?: string; error?: string }).message
      ?? (payload as { message?: string; error?: string }).error;
    if (typeof message === "string" && message.trim().length > 0) {
      return message;
    }
  }
  return fallback;
}
