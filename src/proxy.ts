import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseEnv } from "@/lib/supabase/env";

/**
 * Lightweight 0ms proxy: performs optimistic auth cookie checks only so
 * loading.tsx streams immediately without blocking on a network round-trip.
 * Full JWT verification and RBAC run in requireRouteAccess() on the server.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/api/locale") || pathname.startsWith("/order")) {
    return NextResponse.next();
  }

  const { isConfigured } = getSupabaseEnv();

  if (!isConfigured) {
    if (pathname !== "/login") {
      return NextResponse.redirect(new URL("/login", request.url));
    }
    return NextResponse.next();
  }

  const hasAuthCookie = request.cookies
    .getAll()
    .some((c) => c.name.startsWith("sb-") && c.name.includes("auth-token"));

  const isAuthRoute =
    pathname.startsWith("/login") || pathname.startsWith("/auth");

  if (!hasAuthCookie && !isAuthRoute) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
