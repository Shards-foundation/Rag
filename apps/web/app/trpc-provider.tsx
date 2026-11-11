'use client';

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink } from "@trpc/client";
import React, { useMemo, useState } from "react";
import { trpc } from "../lib/trpc";
import { useAuth, useUser } from "@clerk/nextjs";

export function TrpcProvider({ children }: { children: React.ReactNode }) {
  if (process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) {
    return <AuthenticatedTrpcProvider>{children}</AuthenticatedTrpcProvider>;
  }
  return <GuestTrpcProvider>{children}</GuestTrpcProvider>;
}

function QueryProvider({ children, headers }: { children: React.ReactNode; headers: () => Promise<Record<string, string>> }) {
  const [queryClient] = useState(() => new QueryClient());
  const trpcClient = useMemo(() => trpc.createClient({
    links: [httpBatchLink({ url: "/api/trpc", headers })],
  }), [headers]);

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </trpc.Provider>
  );
}

function GuestTrpcProvider({ children }: { children: React.ReactNode }) {
  const headers = useMemo(() => async () => ({}), []);
  return <QueryProvider headers={headers}>{children}</QueryProvider>;
}

function AuthenticatedTrpcProvider({ children }: { children: React.ReactNode }) {
  const { getToken } = useAuth();
  const { user } = useUser();
  const organizationId = String(user?.unsafeMetadata?.activeOrgId ?? "");
  const headers = useMemo(() => async () => {
    const token = await getToken();
    return {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(organizationId ? { "x-org-id": organizationId } : {}),
    };
  }, [getToken, organizationId]);
  return <QueryProvider headers={headers}>{children}</QueryProvider>;
}
