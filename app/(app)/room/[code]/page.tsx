"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { useQuery } from "@tanstack/react-query";
import Sidebar from "@/components/layout/Sidebar";
import Topbar from "@/components/layout/Topbar";
import RightPanel from "@/components/layout/RightPanel";
import ProjectPlannerHome from "@/components/planner/ProjectPlannerHome";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useRoomStore } from "@/lib/store";

function PanelParamReader({ onPanelDetected }: { onPanelDetected?: () => void }) {
  const searchParams = useSearchParams();
  const panel = searchParams.get("panel");
  const { panelTab, setPanelTab } = useRoomStore();

  useEffect(() => {
    if (panel === "plan" || panel === "trello" || panel === "guide" || panel === "activity") {
      if (panel !== panelTab) {
        setPanelTab(panel);
      }
      onPanelDetected?.();
    }
  }, [panel, panelTab, setPanelTab, onPanelDetected]);

  return null;
}

export default function RoomHomePage() {
  const params = useParams<{ code: string }>();
  const code = params.code;
  const router = useRouter();
  const { data: session, status } = useSession();
  const { room, setRoom } = useRoomStore();

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [mobilePanelOpen, setMobilePanelOpen] = useState(false);
  const [desktopPanelOpen, setDesktopPanelOpen] = useState(false);
  const openDesktopPanel = useCallback(() => setDesktopPanelOpen(true), []);

  useQuery({
    queryKey: ["room", code],
    queryFn: async () => {
      const res = await fetch(`/api/rooms/${code}`);
      if (!res.ok) throw new Error("Failed to load room");
      const data = await res.json();
      setRoom(data.room);
      return data.room;
    },
    enabled: status === "authenticated",
  });

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/");
    }
  }, [router, status]);

  if (status !== "authenticated") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">Checking your session...</p>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-background">
      <Suspense fallback={null}>
        <PanelParamReader onPanelDetected={openDesktopPanel} />
      </Suspense>

      <Topbar
        onOpenSidebar={() => setSidebarOpen(true)}
        onTogglePanel={() => setDesktopPanelOpen((open) => !open)}
        onOpenMobilePanel={() => setMobilePanelOpen(true)}
        panelOpen={desktopPanelOpen}
      />

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex min-h-0 flex-1 flex-col">
          <div className="mx-auto flex min-h-0 w-full max-w-4xl flex-1 flex-col px-4 pb-4 pt-3">
            <div className="flex-1 overflow-y-auto">
              <ProjectPlannerHome
                roomCode={code}
                members={room?.members ?? []}
                sessionEmail={session?.user?.email}
                onOpenChat={() => router.push(`/room/${code}/chat`)}
              />
            </div>
          </div>
        </main>

        {desktopPanelOpen ? (
          <RightPanel className="hidden lg:flex" onClose={() => setDesktopPanelOpen(false)} />
        ) : null}
      </div>

      <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
        <SheetTrigger asChild>
          <div />
        </SheetTrigger>
        <SheetContent side="left" className="p-0">
          <Sidebar className="flex w-full" />
        </SheetContent>
      </Sheet>

      <Sheet open={mobilePanelOpen} onOpenChange={setMobilePanelOpen}>
        <SheetTrigger asChild>
          <div />
        </SheetTrigger>
        <SheetContent side="right" className="p-0">
          <div className="h-full">
            <RightPanel className="flex h-full w-full" onClose={() => setMobilePanelOpen(false)} />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
