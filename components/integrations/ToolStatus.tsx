import type { ToolAction } from "@/lib/types";

type ToolStatusProps = {
  actions: ToolAction[];
};

export default function ToolStatus({ actions }: ToolStatusProps) {
  return (
    <div className="rounded-2xl border border-border bg-muted/40 p-4">
      <h3 className="text-sm font-semibold">Tool activity</h3>
      <div className="mt-3 flex flex-col gap-2">
        {actions.length === 0 ? (
          <p className="text-xs text-muted-foreground">No tool calls yet.</p>
        ) : (
          actions.map((action) => (
            <div key={action.id} className="rounded-xl border border-border bg-card p-3">
              <p className="text-xs font-medium">{action.summary}</p>
              <p className="text-[11px] text-muted-foreground">
                {action.tool} · {action.status} · {new Date(action.createdAt).toLocaleTimeString()}
              </p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
