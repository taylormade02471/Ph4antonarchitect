import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Shopify Product Intelligence",
  description: "Secure Shopify data backend for product intelligence workflows.",
};

const isClerkConfigured = Boolean(
  process.env.CLERK_SECRET_KEY &&
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
);

export default function RootLayout({ children }: LayoutProps<"/">) {
  const body = (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );

  if (!isClerkConfigured) {
    return body;
  }

  return <ClerkProvider>{body}</ClerkProvider>;
}
