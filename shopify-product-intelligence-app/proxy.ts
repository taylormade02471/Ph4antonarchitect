import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const publicRoutes = [
  /^\/$/,
  /^\/__clerk(?:\/.*)?$/,
  /^\/sign-in(?:\/.*)?$/,
  /^\/sign-up(?:\/.*)?$/,
  /^\/api\/auth$/,
  /^\/api\/auth\/callback$/,
  /^\/api\/shopify\/install$/,
  /^\/api\/shopify\/callback$/,
  /^\/api\/shopify\/installed-products$/,
  /^\/api\/shops$/,
  /^\/api\/app-store\/readiness$/,
  /^\/api\/tenancy\/readiness$/,
];

const isClerkConfigured = Boolean(
  process.env.CLERK_SECRET_KEY &&
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
);

function isPublicPath(pathname: string) {
  return publicRoutes.some((pattern) => pattern.test(pathname));
}

const openProxy = (request: Request) => {
  const pathname = new URL(request.url).pathname;

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  return NextResponse.json(
    {
      status: "error",
      message:
        "Operator authentication is not configured. Set Clerk environment variables before accessing private routes.",
    },
    { status: 503 }
  );
};

export default isClerkConfigured
  ? clerkMiddleware(
      async (auth, request) => {
        if (isPublicPath(request.nextUrl.pathname)) {
          return;
        }

        await auth.protect();
      },
      {
        frontendApiProxy: {
          enabled: true,
        },
      }
    )
  : openProxy;

export const config = {
  matcher: [
    "/__clerk/:path*",
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api)(.*)",
  ],
};
