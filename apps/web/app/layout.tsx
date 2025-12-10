import React from 'react';
import { ClerkProvider } from '@clerk/nextjs';
import { TrpcProvider } from './trpc-provider';
import './globals.css';

export const metadata = {
  title: 'Lumina',
  description: 'Enterprise AI Knowledge Hub',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const hasClerkKey = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

  if (hasClerkKey) {
    return (
      <ClerkProvider>
        <html lang="en">
          <body>
            <TrpcProvider children={children} />
          </body>
        </html>
      </ClerkProvider>
    );
  }

  return (
    <html lang="en">
      <body>
        <TrpcProvider children={children} />
      </body>
    </html>
  );
}