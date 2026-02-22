import { getServerSession } from "next-auth";
import { authOptions } from "./auth";
import { prisma } from "./prisma";

export async function requireSessionUser() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    throw new Error("UNAUTHORIZED");
  }

  const user = await prisma.user.upsert({
    where: { email: session.user.email },
    update: {
      name: session.user.name ?? undefined,
      image: session.user.image ?? undefined
    },
    create: {
      email: session.user.email,
      name: session.user.name ?? null,
      image: session.user.image ?? null
    }
  });

  return { session, user };
}

export async function requireRoomMember(roomCode: string) {
  const { user } = await requireSessionUser();
  const room = await prisma.room.findUnique({
    where: { code: roomCode },
    select: {
      id: true,
      code: true,
      name: true,
      projectGoal: true,
      trelloBoardId: true,
      trelloListId: true,
      members: {
        select: {
          userId: true,
          role: true,
          trelloMemberId: true,
        },
      },
    },
  });
  if (!room) {
    throw new Error("NOT_FOUND");
  }
  const isMember = room.members.some((m) => m.userId === user.id);
  if (!isMember) {
    throw new Error("FORBIDDEN");
  }
  return { user, room };
}
