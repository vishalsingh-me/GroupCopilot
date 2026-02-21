import { NextRequest, NextResponse } from "next/server";

// Protected UI routes that require auth
const PROTECTED_PATHS = ["/dashboard", "/teams", "/join"];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isProtected = PROTECTED_PATHS.some((p) => pathname.startsWith(p));

  if (isProtected) {
    const sessionToken = req.cookies.get("gcp_session")?.value;
    if (!sessionToken) {
      const loginUrl = new URL("/login", req.url);
      loginUrl.searchParams.set("redirect", pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/teams/:path*", "/join"],
};
