import React from "react";
import { ClerkProvider } from "@clerk/nextjs";
import { TrpcProvider } from "./trpc-provider";
import "../globals.css";

export const metadata = {
  title: "Lumina RAG",
  description: "Private, source-grounded answers from your organization's documents.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const content = <TrpcProvider>{children}</TrpcProvider>;
  return (
    <html lang="en">
      <body>
        {process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ? <ClerkProvider>{content}</ClerkProvider> : content}
      </body>
    </html>
  );
}
