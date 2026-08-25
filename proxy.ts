import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

const retiredRoutes = ["/activities", "/activity-log", "/attendance", "/constraints", "/crews", "/daily-plan", "/evidence", "/forecast", "/materials", "/plant", "/readiness", "/reports", "/scenarios", "/settings", "/timeline"];

export async function proxy(request: NextRequest) {
  if (retiredRoutes.some((route) => request.nextUrl.pathname === route || request.nextUrl.pathname.startsWith(`${route}/`))) return NextResponse.redirect(new URL("/dashboard", request.url));
  if (["/", "/dashboard", "/programme", "/daily-update"].includes(request.nextUrl.pathname)) return NextResponse.next({ request });
  return updateSession(request);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
