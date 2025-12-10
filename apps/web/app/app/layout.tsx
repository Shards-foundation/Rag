'use client';
import { useUser } from "@clerk/nextjs";
import { trpc } from "../../lib/trpc";
import React, { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { MessageSquare, Database, Users } from "lucide-react";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const hasClerkKey = typeof process !== 'undefined' && !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  
  if (!hasClerkKey) {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-slate-950 text-white p-6 text-center">
        <h2 className="text-2xl font-bold text-red-500 mb-4">Configuration Missing</h2>
        <p className="max-w-md text-slate-400">
          Clerk keys are missing. Please use Lite Mode.
        </p>
        <Link href="/" className="mt-8 px-6 py-2 bg-slate-800 rounded hover:bg-slate-700 transition">
          Back to Home
        </Link>
      </div>
    );
  }

  const { user, isLoaded } = useUser();
  const router = useRouter();

  const meMutation = trpc.me.useMutation();

  useEffect(() => {
    if (isLoaded && user) {
      meMutation.mutate({ 
        clerkId: user.id, 
        email: user.primaryEmailAddress?.emailAddress || "" 
      });
    }
  }, [isLoaded, user]);

  if (!isLoaded) return <div className="h-screen flex items-center justify-center text-white bg-slate-950">Loading Auth...</div>;
  if (!user) {
    if (typeof window !== 'undefined') router.push("/");
    return null;
  }

  const activeOrgId = user.unsafeMetadata.activeOrgId;

  if (!activeOrgId) {
      return (
          <div className="h-screen flex flex-col items-center justify-center bg-slate-950 text-white">
              <h2 className="text-2xl mb-4">Welcome, {user.firstName}</h2>
              <p className="mb-4">You need to create an organization to start.</p>
              <CreateOrgForm userId={user.id} />
          </div>
      )
  }

  return (
    <div className="flex h-screen bg-slate-950 text-slate-100">
      <aside className="w-64 border-r border-slate-800 p-4 flex flex-col">
        <Link href="/app" className="font-bold text-xl mb-8 block hover:text-blue-400 transition">Lumina</Link>
        <nav className="space-y-2 flex-1">
          <NavLink href="/app/chat" icon={<MessageSquare size={18}/>}>Chat</NavLink>
          <NavLink href="/app/settings/sources" icon={<Database size={18}/>}>Data Sources</NavLink>
          <NavLink href="/app/settings/team" icon={<Users size={18}/>}>Team</NavLink>
        </nav>
        <div className="text-xs text-slate-500">Org: {activeOrgId}</div>
      </aside>
      <main className="flex-1 flex flex-col overflow-hidden">
        {children}
      </main>
    </div>
  );
}

function NavLink({ href, children, icon }: any) {
    return (
      <Link href={href} className="flex items-center gap-3 px-4 py-2 rounded hover:bg-slate-800 transition">
        {icon}
        {children}
      </Link>
    );
}

function CreateOrgForm({ userId }: { userId: string }) {
    const { user } = useUser();
    const createOrg = trpc.createOrg.useMutation({
        onSuccess: async (org) => {
            await user?.update({ unsafeMetadata: { activeOrgId: org.id } });
            window.location.reload();
        }
    });

    const onSubmit = (e: any) => {
        e.preventDefault();
        const name = e.target.orgName.value;
        createOrg.mutate({ clerkId: userId, name });
    }

    return (
        <form onSubmit={onSubmit} className="flex gap-2">
            <input name="orgName" placeholder="Organization Name" className="text-black px-3 py-2 rounded" required />
            <button disabled={createOrg.isLoading} className="bg-blue-600 px-4 py-2 rounded">Create</button>
        </form>
    )
}