"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useRoomStore } from "@/lib/store";

export default function SettingsPage() {
  const { resetState } = useRoomStore();
  const statusQuery = useQuery({
    queryKey: ["status"],
    queryFn: async () => {
      const res = await fetch("/api/status");
      if (!res.ok) throw new Error("Failed to load status");
      return res.json() as Promise<{ mockLLM: boolean; mockTools: boolean }>;
    }
  });

  return (
    <main className="min-h-screen bg-background px-6 py-10">
      <div className="mx-auto flex max-w-3xl flex-col gap-4 rounded-2xl border border-border bg-card p-6 shadow-soft">
        <Link href="/" className="text-sm text-muted-foreground">
          ← Back to home
        </Link>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <div className="rounded-xl border border-border bg-muted/30 p-4">
          <p className="text-sm font-semibold">Service status</p>
          <p className="text-xs text-muted-foreground mt-1">
            LLM: {statusQuery.data?.mockLLM ? "Mock mode (GEMINI_API_KEY missing)" : "Live"}
          </p>
          <p className="text-xs text-muted-foreground">
            MCP tools: {statusQuery.data?.mockTools ? "Mock mode (MCP_SERVER_URL missing)" : "Live"}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-muted/30 p-4">
          <p className="text-sm font-semibold">Privacy</p>
          <p className="text-xs text-muted-foreground">Clear local client state (room cache, tickets).</p>
          <Button className="mt-2" variant="outline" onClick={resetState}>
            Clear my local data
          </Button>
        </div>
      </div>
    </main>
  );
}
