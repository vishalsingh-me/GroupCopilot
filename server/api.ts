import "server-only";
import { NextResponse } from "next/server";
import { ZodError } from "zod";

export type ApiError = {
  error: { code: string; message: string; details?: unknown };
};

export function ok<T>(data: T, status = 200) {
  return NextResponse.json(data, { status });
}

export function err(code: string, message: string, status: number, details?: unknown) {
  return NextResponse.json(
    { error: { code, message, details } } satisfies ApiError,
    { status }
  );
}

export function handleRouteError(e: unknown) {
  if (e instanceof Error) {
    if (e.message === "UNAUTHORIZED") return err("UNAUTHORIZED", "Authentication required", 401);
    if (e.message === "FORBIDDEN") return err("FORBIDDEN", "Not a team member", 403);
    if (e.message === "NOT_FOUND") return err("NOT_FOUND", "Resource not found", 404);
  }
  if (e instanceof ZodError) {
    return err("VALIDATION_ERROR", "Invalid request body", 400, e.errors);
  }
  console.error("Unhandled route error:", e);
  return err("INTERNAL_ERROR", "Internal server error", 500);
}
