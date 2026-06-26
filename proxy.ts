import { NextResponse }  from "next/server";
import type { NextRequest } from "next/server";
import { auth }           from "@/auth";

// Webhook endpoints that authenticate themselves with a shared secret (?secret=)
// and must be reachable without a login session — schedulers and the sheet's
// Apps Script have no cookies. Each route still enforces the secret internally.
const SECRET_AUTH_ROUTES = [
  "/api/upload/sheet-receive",
  "/api/upload/sheet-sync",
  "/api/admin/backup-email",
];

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Secret-authenticated webhooks bypass the session gate (they self-protect).
  if (SECRET_AUTH_ROUTES.some(p => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Public routes (accessible without auth)
  if (pathname === "/login" || pathname === "/signed-out") {
    if (pathname === "/login") {
      const session = await auth();
      if (session) return NextResponse.redirect(new URL("/", req.url));
    }
    return NextResponse.next();
  }

  // Protect all other routes
  const session = await auth();
  if (!session) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  return NextResponse.next();
}

// Matcher excludes:
// - api/auth       → NextAuth callback routes
// - _next/static   → Next.js built assets
// - _next/image    → Next.js optimized images
// - favicon.ico    → browser-mandated icon
// - any path with a dot in the final segment (public/*.png, .svg, .jpg, etc)
export const config = {
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};

// redeploy: ensure secret-auth webhook bypass is live
