import { ensureClientIdOnResponse } from "@/lib/clientId";
import { relativeUrl } from "@/lib/env";
import { isAdmin, verifySession } from "@/lib/session";
import { NextRequest, NextResponse, ProxyConfig } from "next/server";

const protectedRoutes: RegExp[] = [
  // If any of these patterns match the user will be redirected
  /\/admin\b/,
  /\/tea\/[^\/]*\/edit\b/,
];

// The proxy is run before a request is completed.
// Read more: https://nextjs.org/docs/app/getting-started/proxy
export default async function proxy(req: NextRequest): Promise<NextResponse> {
  // Check if the current route is protected
  const path = req.nextUrl.pathname;
  const isProtectedRoute = protectedRoutes.some(pattern => pattern.test(path));

  if (isProtectedRoute) {
    // The redirect is to the homepage instead of the login page since Gamma
    // will instantly authenticate the user if they have authorized the client.
    // This is an unintuitive user flow, as the user is logged in without an
    // intentional action.
    const unauthorizedPage = relativeUrl("/");

    // Verify session and redirect if not authenticated
    try {
      await verifySession();
    } catch (e) {
      // Do not log errors for when redirect() is called in verifySession(), this is an expected error.
      const isRedirectError =
        typeof e === "object" &&
        e !== null &&
        String((e as Record<string, unknown>).digest).includes("NEXT_REDIRECT");

      if (!isRedirectError) {
        console.error("Failed to verify session:", e);
      }

      return NextResponse.redirect(unauthorizedPage);
    }

    const admin = await isAdmin().catch(reason => {
      console.error("Failed to check admin status:", reason);
      return false;
    });
    if (!admin) {
      return NextResponse.redirect(unauthorizedPage);
    }
  }

  // Allow the request to continue as normal, ensuring an anonymous client id
  // cookie is present (and renew its expiry on every visit).
  const res = NextResponse.next();
  ensureClientIdOnResponse(req, res);
  return res;
}

// Configure the proxy
// Read more: https://nextjs.org/docs/app/api-reference/file-conventions/proxy#matcher
export const config: ProxyConfig = {
  // Exclude API routes, static files, image optimizations, and .png files
  matcher: ["/((?!api|_next/static|_next/image|.*\\.png$).*)"],
};
