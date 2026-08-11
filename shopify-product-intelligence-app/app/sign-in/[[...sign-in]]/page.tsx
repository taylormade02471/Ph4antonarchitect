import { SignIn } from "@clerk/nextjs";

const isClerkConfigured = Boolean(
  process.env.CLERK_SECRET_KEY &&
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
);

export default function SignInPage() {
  if (!isClerkConfigured) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f6f4ef] px-6 text-[#181916]">
        <section className="max-w-md rounded-lg border border-[#d8d2c4] bg-white p-6 shadow-sm">
          <p className="text-sm font-semibold uppercase tracking-[0.12em] text-[#746a54]">
            Clerk is not configured
          </p>
          <h1 className="mt-3 text-2xl font-semibold">Private login pending</h1>
          <p className="mt-3 text-sm leading-6 text-[#5d594e]">
            Add the project-scoped Clerk environment variables before using
            operator sign-in.
          </p>
        </section>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f6f4ef] px-6">
      <SignIn />
    </main>
  );
}
