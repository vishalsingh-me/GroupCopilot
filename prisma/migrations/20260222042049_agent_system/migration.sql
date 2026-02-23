/*
  Warnings:

  - You are about to drop the `Ticket` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `ToolAction` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "AgentState" AS ENUM ('IDLE', 'WEEKLY_KICKOFF', 'SKELETON_DRAFT', 'SKELETON_QA', 'APPROVAL_GATE_1', 'PLANNING_MEETING', 'TASK_PROPOSALS', 'APPROVAL_GATE_2', 'TRELLO_PUBLISH', 'MONITOR', 'WEEKLY_REVIEW');

-- CreateEnum
CREATE TYPE "ApprovalType" AS ENUM ('SKELETON', 'TASK_PLAN');

-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('pending', 'approved', 'rejected');

-- CreateEnum
CREATE TYPE "VoteChoice" AS ENUM ('approve', 'request_change');

-- DropForeignKey
ALTER TABLE "Ticket" DROP CONSTRAINT "Ticket_ownerUserId_fkey";

-- DropForeignKey
ALTER TABLE "Ticket" DROP CONSTRAINT "Ticket_roomId_fkey";

-- DropForeignKey
ALTER TABLE "Ticket" DROP CONSTRAINT "Ticket_suggestedOwnerUserId_fkey";

-- DropForeignKey
ALTER TABLE "ToolAction" DROP CONSTRAINT "ToolAction_requestedByUserId_fkey";

-- DropForeignKey
ALTER TABLE "ToolAction" DROP CONSTRAINT "ToolAction_roomId_fkey";

-- AlterTable
ALTER TABLE "Room" ADD COLUMN     "projectGoal" TEXT,
ADD COLUMN     "trelloBoardId" TEXT,
ADD COLUMN     "trelloListId" TEXT;

-- AlterTable
ALTER TABLE "RoomMember" ADD COLUMN     "trelloMemberId" TEXT;

-- DropTable
DROP TABLE "Ticket";

-- DropTable
DROP TABLE "ToolAction";

-- DropEnum
DROP TYPE "TicketEffort";

-- DropEnum
DROP TYPE "TicketPriority";

-- DropEnum
DROP TYPE "TicketStatus";

-- DropEnum
DROP TYPE "ToolActionStatus";

-- DropEnum
DROP TYPE "ToolActionType";

-- CreateTable
CREATE TABLE "AgentSession" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "state" "AgentState" NOT NULL DEFAULT 'IDLE',
    "weekNumber" INTEGER NOT NULL,
    "data" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApprovalRequest" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "type" "ApprovalType" NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'pending',
    "resolvedAt" TIMESTAMP(3),
    "resolvedBy" TEXT,

    CONSTRAINT "ApprovalRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApprovalVote" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "vote" "VoteChoice" NOT NULL,
    "comment" TEXT,
    "votedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApprovalVote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "actorId" TEXT,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthSnapshot" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "weekNumber" INTEGER NOT NULL,
    "participation" JSONB NOT NULL DEFAULT '{}',
    "stallCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HealthSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrelloCardCache" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "trelloCardId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "dueDate" TIMESTAMP(3),
    "lastSyncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrelloCardCache_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AgentSession_roomId_weekNumber_key" ON "AgentSession"("roomId", "weekNumber");

-- CreateIndex
CREATE UNIQUE INDEX "ApprovalVote_requestId_userId_key" ON "ApprovalVote"("requestId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "HealthSnapshot_roomId_weekNumber_key" ON "HealthSnapshot"("roomId", "weekNumber");

-- CreateIndex
CREATE UNIQUE INDEX "TrelloCardCache_trelloCardId_key" ON "TrelloCardCache"("trelloCardId");

-- AddForeignKey
ALTER TABLE "AgentSession" ADD CONSTRAINT "AgentSession_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalRequest" ADD CONSTRAINT "ApprovalRequest_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "AgentSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalVote" ADD CONSTRAINT "ApprovalVote_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "ApprovalRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalVote" ADD CONSTRAINT "ApprovalVote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthSnapshot" ADD CONSTRAINT "HealthSnapshot_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrelloCardCache" ADD CONSTRAINT "TrelloCardCache_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;
