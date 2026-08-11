import { SignUp } from "@clerk/nextjs";

const isClerkConfigured = Boolean(
  process.env.CLERK_SECRET_KEY &&
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
);

export default function SignUpPage() {
  if (!isClerkConfigured) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f6f4ef] px-6 text-[#181916]">
        <section className="max-w-md rounded-lg border border-[#d8d2c4] bg-white p-6 shadow-sm">
          <p className="text-sm font-semibold uppercase tracking-[0.12em] text-[#746a54]">
            Invitation-only access
          </p>
          <h1 className="mt-3 text-2xl font-semibold">Sign-up is not open yet</h1>
          <p className="mt-3 text-sm leading-6 text-[#5d594e]">
            Clerk restricted sign-up must be configured before private beta
            invitations are sent.
          </p>
        </section>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f6f4ef] px-6">
      <SignUp />
    </main>
  );
}
