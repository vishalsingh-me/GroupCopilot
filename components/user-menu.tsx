"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { signIn, signOut, useSession } from "next-auth/react";
import { ChevronDown, LogOut, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import Skeleton from "@/components/common/Skeleton";

export function getInitials(name?: string | null, email?: string | null): string {
  const safeName = (name ?? "").trim();
  if (safeName) {
    const parts = safeName.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
    }
    return safeName.slice(0, 2).toUpperCase();
  }

  const safeEmail = (email ?? "").trim();
  if (safeEmail) {
    const prefix = safeEmail.split("@")[0] ?? "";
    return prefix.slice(0, 2).toUpperCase();
  }

  return "GC";
}

export default function UserMenu() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [imageError, setImageError] = useState(false);

  const user = session?.user;
  const initials = useMemo(() => getInitials(user?.name, user?.email), [user?.name, user?.email]);
  const imageSrc = (user?.image ?? "").trim();

  if (status === "loading") {
    return (
      <div className="flex items-center justify-end">
        <Skeleton className="h-9 w-28 rounded-full" />
      </div>
    );
  }

  if (!session) {
    return (
      <Button variant="outline" onClick={() => signIn("google")}>
        Sign in
      </Button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="h-9 gap-2 rounded-full px-2">
          <Avatar className="h-7 w-7">
            {imageSrc && !imageError ? (
              <AvatarImage
                src={imageSrc}
                alt={user?.name ?? "User"}
                referrerPolicy="no-referrer"
                onError={() => setImageError(true)}
              />
            ) : null}
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
          <span className="hidden max-w-[120px] truncate text-sm font-medium md:inline">
            {user?.name ?? "User"}
          </span>
          <ChevronDown className="hidden h-4 w-4 text-muted-foreground md:inline" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="space-y-1 normal-case">
          <p className="text-sm font-semibold">{user?.name ?? "User"}</p>
          <p className="text-xs text-muted-foreground">{user?.email ?? ""}</p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={(event) => {
            event.preventDefault();
            router.push("/settings");
          }}
        >
          <Settings className="mr-2 h-4 w-4" />
          Settings
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={(event) => {
            event.preventDefault();
            signOut({ callbackUrl: "/" });
          }}
        >
          <LogOut className="mr-2 h-4 w-4" />
          Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
