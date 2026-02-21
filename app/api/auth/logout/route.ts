import { clearSessionCookie } from "@/server/auth";
import { ok } from "@/server/api";

export async function POST() {
  await clearSessionCookie();
  return ok({ success: true });
}
