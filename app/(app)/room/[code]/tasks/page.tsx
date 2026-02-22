import { redirect } from "next/navigation";
import AdminTasksPage from "@/components/tasks/AdminTasksPage";
import { requireRoomMember } from "@/lib/auth-helpers";
import { isRoomAdminRole } from "@/lib/room-admin";

export default async function RoomTasksPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;

  try {
    const { room, user } = await requireRoomMember(code.toUpperCase());
    const membership = room.members.find((member) => member.userId === user.id);
    if (!isRoomAdminRole(membership?.role)) {
      redirect(`/room/${code}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message === "UNAUTHORIZED" || message === "FORBIDDEN" || message === "NOT_FOUND") {
      redirect("/");
    }
    throw error;
  }

  return <AdminTasksPage roomCode={code.toUpperCase()} />;
}
