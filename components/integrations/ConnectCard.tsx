import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

type ConnectCardProps = {
  name: string;
  status: "connected" | "disconnected" | "mock";
  description: string;
};

export default function ConnectCard({ name, status, description }: ConnectCardProps) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-soft">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">{name}</h3>
        <Badge variant={status === "connected" ? "accent" : "outline"}>{status}</Badge>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">{description}</p>
      <Button className="mt-3" variant="outline" disabled={status !== "disconnected"}>
        {status === "disconnected" ? "Connect" : "Connected"}
      </Button>
    </div>
  );
}
