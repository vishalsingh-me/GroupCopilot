"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useRoomStore } from "@/lib/store";
import { useSession } from "next-auth/react";
import { useToast } from "@/components/common/use-toast";
import { useState } from "react";

export default function Sidebar({ className }: { className?: string }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { room } = useRoomStore();
  const { data: session } = useSession();
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const roomPath = room ? `/room/${room.code}` : "/room";
  const activePanel = searchParams.get("panel");
  const navItems = [
    { label: "Chat", href: roomPath, panel: null },
    { label: "Tickets", href: `${roomPath}?panel=tickets`, panel: "tickets" },
    { label: "Meetings", href: `${roomPath}?panel=meetings`, panel: "meetings" },
    { label: "Guide", href: `${roomPath}?panel=guide`, panel: "guide" },
    { label: "Settings", href: "/settings" }
  ];

  const copyRoomCode = async () => {
    if (!room?.code) return;
    await navigator.clipboard.writeText(room.code);
    setCopied(true);
    toast({ title: "Room code copied", description: room.code });
    setTimeout(() => setCopied(false), 1200);
  };

  return (
    <aside className={`h-full w-60 flex-col gap-5 border-r border-border/70 bg-muted/20 p-4 ${className ?? "hidden lg:flex"}`}>
      <div className="space-y-2">
        <div>
          <p className="text-xs uppercase text-muted-foreground">Room</p>
          <p className="text-base font-semibold">{room?.name ?? "No room"}</p>
        </div>
        <Button variant="outline" size="sm" className="w-full justify-between" onClick={copyRoomCode}>
          <span className="font-mono text-xs">{room?.code ?? "---"}</span>
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
        </Button>
      </div>
      <div>
        <p className="text-xs uppercase text-muted-foreground">You</p>
        <p className="text-sm font-semibold">{session?.user?.name ?? "Guest"}</p>
        <p className="text-xs text-muted-foreground">{session?.user?.email ?? ""}</p>
      </div>
      <div>
        <p className="text-xs uppercase text-muted-foreground">Members</p>
        <div className="mt-2 flex flex-col gap-2">
          {(room?.members ?? []).length === 0 ? (
            <p className="text-xs text-muted-foreground">No members yet.</p>
          ) : (
            room?.members.map((member) => (
              <div key={member.id} className="flex items-center justify-between text-sm">
                <span>{member.name}</span>
                <span className="text-xs text-muted-foreground">{member.role ?? ""}</span>
              </div>
            ))
          )}
        </div>
      </div>
      <nav className="flex flex-col gap-2">
        {navItems.map((item) => {
          const isActive = item.panel
            ? pathname === roomPath && activePanel === item.panel
            : pathname === item.href && activePanel === null;
          return (
            <Link
              key={item.label}
              href={item.href}
              className={cn(
                "rounded-lg px-3 py-2 text-sm font-medium transition",
                isActive ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:bg-background hover:text-foreground"
              )}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
