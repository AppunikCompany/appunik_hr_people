import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { Providers } from "./providers";
import { Layout } from "@/components/Layout";
import "./globals.css";

export const metadata: Metadata = {
  title: "HR System",
  description: "HR Management System — Appunik",
};

const clerkPublishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? "";
const clerkEnabled = !!clerkPublishableKey;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!clerkEnabled) {
    return (
      <html lang="en">
        <head>
          <script
            src="https://report.appunik-team.com/widget.js"
            data-site-token="fk9IZS7jOktbL8jtdz7VkCKXDFk11v-g6dypk0D0iEY"
          ></script>
        </head>
        <body>
          <Providers clerkEnabled={false}>
            <div className="px-4 py-2 border-b border-border bg-muted text-xs text-muted-foreground">
              Running without Clerk auth. Set{" "}
              <code className="font-mono">NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY</code>{" "}
              to enable login.
            </div>
            <Layout clerkEnabled={false}>{children}</Layout>
          </Providers>
        </body>
      </html>
    );
  }

  return (
    <html lang="en">
      <head>
        <script
          src="https://report.appunik-team.com/widget.js"
          data-site-token="fk9IZS7jOktbL8jtdz7VkCKXDFk11v-g6dypk0D0iEY"
        ></script>
      </head>
      <body>
        <ClerkProvider publishableKey={clerkPublishableKey}>
          <Providers clerkEnabled>
            <Layout clerkEnabled>{children}</Layout>
          </Providers>
        </ClerkProvider>
      </body>
    </html>
  );
}
