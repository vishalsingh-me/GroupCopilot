"use client";

import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRoomStore } from "@/lib/store";

export default function ActivityPanel() {
  const { room, toolActions, setToolActions } = useRoomStore();
  const code = room?.code;

  useQuery({
    queryKey: ["tool-actions", code],
    queryFn: async () => {
      const res = await fetch(`/api/rooms/${code}/tool-actions`);
      if (!res.ok) throw new Error("Failed to load tool actions");
      const data = await res.json();
      setToolActions(data.actions);
      return data.actions;
    },
    enabled: Boolean(code)
  });

  useEffect(() => {
    // avoid lint complaint; no-op when no room
  }, [code]);

  if (toolActions.length === 0) {
    return <p className="text-sm text-muted-foreground">No tool actions yet.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {toolActions.map((action) => (
        <div key={action.id} className="rounded-xl border border-border p-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold">{action.type}</p>
            <span className="text-xs uppercase text-muted-foreground">{action.status}</span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {typeof action.payload === "string" ? action.payload : JSON.stringify(action.payload)}
          </p>
        </div>
      ))}
    </div>
  );
}
