import { requireUser } from "@/server/auth";
import { ok, handleRouteError } from "@/server/api";

export async function GET() {
  try {
    const user = await requireUser();
    return ok({ user });
  } catch (e) {
    return handleRouteError(e);
  }
}
