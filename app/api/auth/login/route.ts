import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { createSession, setSessionCookie } from "@/server/auth";
import { ok, err, handleRouteError } from "@/server/api";

const LoginBody = z.object({
  email: z.string().email(),
  displayName: z.string().min(1).max(100),
});

export async function POST(req: NextRequest) {
  try {
    const body = LoginBody.parse(await req.json());

    // Upsert user by email — passwordless dev auth
    const existing = await db
      .select()
      .from(users)
      .where(eq(users.email, body.email))
      .limit(1);

    let user = existing[0];
    if (!user) {
      const [created] = await db
        .insert(users)
        .values({ email: body.email, displayName: body.displayName })
        .returning();
      user = created;
    } else {
      // Update last login and display name on re-login
      const [updated] = await db
        .update(users)
        .set({ lastLoginAt: new Date(), displayName: body.displayName })
        .where(eq(users.id, user.id))
        .returning();
      user = updated;
    }

    const token = await createSession(user.id);
    await setSessionCookie(token);

    return ok({
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
      },
    });
  } catch (e) {
    return handleRouteError(e);
  }
}
