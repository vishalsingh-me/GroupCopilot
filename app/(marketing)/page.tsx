"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession, signIn } from "next-auth/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import UserMenu from "@/components/user-menu";
import ThemeToggle from "@/components/layout/ThemeToggle";
import { useRoomStore } from "@/lib/store";

export default function MarketingPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const { setRoom } = useRoomStore();
  const [open, setOpen] = useState<"create" | "join" | null>(null);
  const [roomName, setRoomName] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);

  const ensureSignedIn = async () => {
    if (!session) {
      await signIn("google", { callbackUrl: "/" });
      return false;
    }
    return true;
  };

  const handleCreate = async () => {
    if (!(await ensureSignedIn())) return;
    setLoading(true);
    const response = await fetch("/api/rooms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: roomName || undefined })
    });
    setLoading(false);
    if (!response.ok) return;
    const data = await response.json();
    setRoom(data.room);
    router.push(`/room/${data.room.code}`);
  };

  const handleJoin = async () => {
    if (!(await ensureSignedIn())) return;
    if (!code.trim()) return;
    setLoading(true);
    const response = await fetch("/api/rooms/join", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code })
    });
    setLoading(false);
    if (!response.ok) return;
    const data = await response.json();
    setRoom(data.room);
    router.push(`/room/${data.room.code}`);
  };

  return (
    <main className="min-h-screen bg-background">
      <div className="min-h-screen bg-mesh-light dark:bg-mesh-dark">
        <div className="mx-auto flex min-h-screen max-w-6xl flex-col justify-between px-6 py-16">
          <header className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase text-muted-foreground">Group Copilot</p>
              <h1 className="text-3xl font-semibold tracking-tight">Collaborate smarter with a shared AI copilot.</h1>
            </div>
            <div className="flex items-center gap-3">
              <UserMenu />
              <Badge variant="accent">Education Collaboration</Badge>
              <ThemeToggle />
            </div>
          </header>

          <section className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Create a room</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Start a new shared space and invite your team.
                </p>
              </CardHeader>
              <CardContent>
                <Button size="lg" onClick={() => setOpen("create")}>
                  Create room
                </Button>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Join with a code</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Already have a room code? Join in seconds.
                </p>
              </CardHeader>
              <CardContent>
                <Button variant="secondary" size="lg" onClick={() => setOpen("join")}>
                  Join room
                </Button>
              </CardContent>
            </Card>
          </section>

          <section className="grid gap-6 rounded-2xl border border-border bg-card/80 p-6 shadow-soft lg:grid-cols-3">
            <div>
              <h2 className="text-lg font-semibold">Proactive facilitation</h2>
              <p className="text-sm text-muted-foreground">
                The assistant asks clarifying questions and keeps the team aligned.
              </p>
            </div>
            <div>
              <h2 className="text-lg font-semibold">Tickets + meetings</h2>
              <p className="text-sm text-muted-foreground">
                Convert plans into tasks and suggest meeting times in one flow.
              </p>
            </div>
            <div>
              <h2 className="text-lg font-semibold">Conflict support</h2>
              <p className="text-sm text-muted-foreground">
                Use a lightweight guide and scripts to resolve tension early.
              </p>
            </div>
          </section>
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
            <Button onClick={open === "create" ? handleCreate : handleJoin} disabled={loading}>
              {loading ? "Working..." : "Continue"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </main>
  );
}
