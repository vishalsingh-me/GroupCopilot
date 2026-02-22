"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useRoomStore } from "@/lib/store";
import { signOut, useSession } from "next-auth/react";

export default function Sidebar({ className }: { className?: string }) {
  const pathname = usePathname();
  const { room } = useRoomStore();
  const { data: session } = useSession();
  const navItems = [
    { label: "Chat", href: room ? `/room/${room.code}` : "/room" },
    { label: "Tickets", href: room ? `/room/${room.code}?panel=tickets` : "/room?panel=tickets" },
    { label: "Meetings", href: room ? `/room/${room.code}?panel=meetings` : "/room?panel=meetings" },
    { label: "Guide", href: room ? `/room/${room.code}?panel=guide` : "/room?panel=guide" },
    { label: "Settings", href: "/settings" }
  ];

  return (
    <aside className={`h-full w-72 flex-col gap-6 border-r border-border bg-card/70 p-6 ${className ?? "hidden lg:flex"}`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase text-muted-foreground">Room</p>
          <p className="text-lg font-semibold">{room?.name ?? "No room"}</p>
        </div>
        <Badge variant="accent">{room?.code ?? "---"}</Badge>
      </div>
      <div>
        <p className="text-xs uppercase text-muted-foreground">You</p>
        <p className="text-base font-semibold">{session?.user?.name ?? "Guest"}</p>
        <p className="text-sm text-muted-foreground">{session?.user?.email ?? ""}</p>
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
          const isActive = pathname === item.href || (item.href.includes("/room") && pathname === "/room");
          return (
            <Link
              key={item.label}
              href={item.href}
              className={cn(
                "rounded-xl px-3 py-2 text-sm font-medium transition",
                isActive ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted"
              )}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="mt-auto">
        {session ? (
          <Button variant="outline" className="mb-2 w-full" onClick={() => signOut()}>
            Sign out
          </Button>
        ) : null}
      </div>
    </aside>
  );
}
