import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const BYPASS_AUTH =
  process.env.NODE_ENV !== "production" && !process.env.CLERK_SECRET_KEY;

const isPublicRoute = createRouteMatcher([
  "/sign-in(.*)",
  "/api/health",
]);

export default BYPASS_AUTH
  ? () => NextResponse.next()
  : clerkMiddleware(async (auth, req) => {
      if (!isPublicRoute(req)) {
        await auth.protect();
      }
    });

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
