import { prisma } from "@/lib/prisma";

export const DEFAULT_MESSAGE_MODE = "brainstorm" as const;

function buildDefaultThreadTitle(existingCount: number): string {
  return `Conversation ${existingCount + 1}`;
}

export async function getOrCreateDefaultThread(roomId: string, createdByUserId: string) {
  const existing = await prisma.conversationThread.findFirst({
    where: { roomId },
    orderBy: [{ lastMessageAt: "desc" }, { createdAt: "asc" }],
  });
  if (existing) {
    return existing;
  }

  return prisma.conversationThread.create({
    data: {
      roomId,
      createdByUserId,
      title: "Conversation 1",
      lastMessageAt: new Date(),
    },
  });
}

export async function ensureRoomThread(
  roomId: string,
  createdByUserId: string,
  threadId?: string | null
) {
  if (!threadId) {
    return getOrCreateDefaultThread(roomId, createdByUserId);
  }

  const thread = await prisma.conversationThread.findFirst({
    where: {
      id: threadId,
      roomId,
    },
  });

  if (!thread) {
    throw new Error("THREAD_NOT_FOUND");
  }

  return thread;
}

export async function createConversationThread(roomId: string, createdByUserId: string, title?: string) {
  const cleanTitle = title?.trim();
  const count = await prisma.conversationThread.count({ where: { roomId } });

  return prisma.conversationThread.create({
    data: {
      roomId,
      createdByUserId,
      title: cleanTitle && cleanTitle.length > 0 ? cleanTitle : buildDefaultThreadTitle(count),
      lastMessageAt: new Date(),
    },
  });
}

export async function touchConversationThread(threadId: string, when: Date = new Date()) {
  await prisma.conversationThread.update({
    where: { id: threadId },
    data: {
      lastMessageAt: when,
      updatedAt: when,
    },
  });
}
