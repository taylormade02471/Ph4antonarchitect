import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const publicRoutes = [
  /^\/$/,
  /^\/sign-in(?:\/.*)?$/,
  /^\/sign-up(?:\/.*)?$/,
  /^\/api\/auth$/,
  /^\/api\/auth\/callback$/,
  /^\/api\/app-store\/readiness$/,
  /^\/api\/tenancy\/readiness$/,
];

const isClerkConfigured = Boolean(
  process.env.CLERK_SECRET_KEY &&
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
);

const openProxy = () => NextResponse.next();

export default isClerkConfigured
  ? clerkMiddleware(async (auth, request) => {
      const isPublicRoute = publicRoutes.some((pattern) =>
        pattern.test(request.nextUrl.pathname)
      );

      if (isPublicRoute) {
        return;
      }

      await auth.protect();
    })
  : openProxy;

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api)(.*)",
  ],
};
