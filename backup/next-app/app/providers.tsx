"use client";
import { useState, useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useAuth } from "@clerk/nextjs";
import { setGetTokenFn } from "@/lib/auth-token";
import { Toaster } from "sonner";

function ClerkTokenBridge() {
  const { getToken } = useAuth();
  useEffect(() => {
    setGetTokenFn(getToken);
  }, [getToken]);
  return null;
}

export function Providers({
  children,
  clerkEnabled,
}: {
  children: React.ReactNode;
  clerkEnabled: boolean;
}) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 30_000, retry: 1 },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      {clerkEnabled ? <ClerkTokenBridge /> : null}
      {children}
      <Toaster richColors position="top-right" />
    </QueryClientProvider>
  );
}
