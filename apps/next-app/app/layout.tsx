import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { Providers } from "./providers";
import { Layout } from "@/components/Layout";
import "./globals.css";

export const metadata: Metadata = {
  title: "HR System",
  description: "HR Management System — Appunik",
};

const hasClerk = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!hasClerk) {
    return (
      <html lang="en">
        <body>
          <Providers>
            <div className="px-4 py-2 border-b border-border bg-muted text-xs text-muted-foreground">
              Running without Clerk auth. Set{" "}
              <code className="font-mono">NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY</code>{" "}
              to enable login.
            </div>
            <Layout>{children}</Layout>
          </Providers>
        </body>
      </html>
    );
  }

  return (
    <html lang="en">
      <body>
        <ClerkProvider>
          <Providers>
            <Layout>{children}</Layout>
          </Providers>
        </ClerkProvider>
      </body>
    </html>
  );
}
