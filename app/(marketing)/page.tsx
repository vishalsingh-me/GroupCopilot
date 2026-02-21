"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import UserMenu from "@/components/user-menu";
import ThemeToggle from "@/components/layout/ThemeToggle";
import { useRoomStore } from "@/lib/store";
import { createRoom, joinRoom } from "@/lib/room";
import type { Role } from "@/lib/types";

const roles: Role[] = ["student", "ta", "instructor", "team member"];

export default function MarketingPage() {
  const router = useRouter();
  const { setProfile, setRoom } = useRoomStore();
  const [open, setOpen] = useState<"create" | "join" | null>(null);
  const [name, setName] = useState("");
  const [role, setRole] = useState<Role>("student");
  const [code, setCode] = useState("");

  const handleSubmit = () => {
    if (!name.trim()) return;
    const profile = { name: name.trim(), role };
    setProfile(profile);
    if (open === "create") {
      setRoom(createRoom(profile));
    }
    if (open === "join") {
      setRoom(joinRoom(profile, code));
    }
    router.push("/room");
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
            <div className="grid gap-2">
              <label className="text-sm font-medium">Display name</label>
              <Input value={name} onChange={(event) => setName(event.target.value)} />
            </div>
            <div className="grid gap-2">
              <label className="text-sm font-medium">Role (optional)</label>
              <select
                className="h-10 rounded-xl border border-input bg-background px-3 text-sm"
                value={role}
                onChange={(event) => setRole(event.target.value as Role)}
              >
                {roles.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </div>
            {open === "join" ? (
              <div className="grid gap-2">
                <label className="text-sm font-medium">Room code</label>
                <Input value={code} onChange={(event) => setCode(event.target.value)} />
              </div>
            ) : null}
            <Button onClick={handleSubmit} disabled={!name.trim()}>
              Continue
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </main>
  );
}
