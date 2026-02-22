"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { usePathname, useSearchParams } from "next/navigation";
import { Check, Copy, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useRoomStore } from "@/lib/store";
import { useSession } from "next-auth/react";
import { useToast } from "@/components/common/use-toast";
import { useState } from "react";
import { TRELLO_MVP_BOARD_URL } from "@/lib/trello/config";

type NavItem = {
  label: string;
  href: string;
  panel?: string | null;
  external?: boolean;
  title?: string;
};

export default function Sidebar({ className }: { className?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { room, resetState } = useRoomStore();
  const { data: session } = useSession();
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);
  const roomPath = room ? `/room/${room.code}` : "/room";
  const chatPath = `${roomPath}/chat`;
  const panelBasePath = pathname === chatPath ? chatPath : roomPath;
  const activePanel = searchParams.get("panel");

  const navItems: NavItem[] = [
    { label: "Home", href: roomPath, panel: null },
    { label: "Chat", href: chatPath, panel: null },
    {
      label: "Trello",
      href: TRELLO_MVP_BOARD_URL,
      external: true,
      title: "Open Trello board"
    },
    { label: "Group Chat", href: `${roomPath}/group-chat` },
    { label: "Settings", href: "/settings" }
  ];

  const copyRoomCode = async () => {
    if (!room?.code) return;
    await navigator.clipboard.writeText(room.code);
    setCopied(true);
    toast({ title: "Room code copied", description: room.code });
    setTimeout(() => setCopied(false), 1200);
  };

  const leaveRoom = async () => {
    if (!room?.code || isLeaving) return;
    const confirmed = window.confirm(
      `Leave room ${room.name ?? room.code}? You can rejoin later with the room code.`
    );
    if (!confirmed) return;

    try {
      setIsLeaving(true);
      const response = await fetch(`/api/rooms/${room.code}/leave`, {
        method: "POST",
        headers: { "Content-Type": "application/json" }
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(
          typeof payload?.error === "string" ? payload.error : "Unable to leave room."
        );
      }

      resetState();
      toast({
        title: "Left room",
        description:
          typeof payload?.message === "string"
            ? payload.message
            : "You were removed from this room."
      });
      router.push("/");
    } catch (error) {
      toast({
        title: "Could not leave room",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsLeaving(false);
    }
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
          const isActive = item.external
            ? false
            : item.panel !== undefined
              ? item.panel
                ? pathname === panelBasePath && activePanel === item.panel
                : pathname === item.href && activePanel === null
              : pathname === item.href;

          const linkClassName = cn(
            "rounded-lg px-3 py-2 text-sm font-medium transition",
            isActive ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:bg-background hover:text-foreground"
          );

          if (item.external) {
            return (
              <a
                key={item.label}
                href={item.href}
                target="_blank"
                rel="noopener noreferrer"
                title={item.title}
                className={linkClassName}
              >
                {item.label}
              </a>
            );
          }

          return (
            <Link key={item.label} href={item.href} title={item.title} className={linkClassName}>
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="mt-auto pt-4">
        <Button
          type="button"
          variant="destructive"
          size="sm"
          className="w-full justify-start whitespace-nowrap text-sm"
          onClick={leaveRoom}
          disabled={!room?.code || isLeaving}
        >
          <LogOut className="mr-2 h-4 w-4 shrink-0" />
          {isLeaving ? "Leaving..." : "Leave Room"}
        </Button>
      </div>
    </aside>
  );
}
