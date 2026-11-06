'use client';

import { SignInButton, SignOutButton, useUser } from "@clerk/nextjs";
import { useEffect, useRef, type FormEvent, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { Database, LogOut, MessageSquare, Users } from "lucide-react";
import { trpc } from "../../lib/trpc";

const EMPTY_MEMBERSHIPS: never[] = [];

export default function AppLayout({ children }: { children: ReactNode }) {
  if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) {
    return <ConfigurationNotice />;
  }
  return <AuthenticatedAppLayout>{children}</AuthenticatedAppLayout>;
}

function ConfigurationNotice() {
  return (
    <main className="min-h-screen grid place-items-center bg-slate-950 p-6 text-center text-white">
      <div className="max-w-lg rounded-2xl border border-slate-800 bg-slate-900 p-8">
        <h1 className="text-2xl font-bold">Full workspace is not configured</h1>
        <p className="mt-3 text-slate-400">Set the Clerk publishable and secret keys to enable secure accounts and shared workspaces. Lite Mode remains available without an account.</p>
        <Link href="/" className="mt-6 inline-block rounded-lg bg-blue-600 px-5 py-3 font-semibold">Back to home</Link>
      </div>
    </main>
  );
}

function AuthenticatedAppLayout({ children }: { children: ReactNode }) {
  const { user, isLoaded } = useUser();
  const me = trpc.me.useQuery(undefined, { enabled: isLoaded && Boolean(user), retry: false });
  const utils = trpc.useUtils();
  const queryClient = useQueryClient();
  const memberships = me.data?.memberships ?? EMPTY_MEMBERSHIPS;
  const activeId = String(user?.unsafeMetadata?.activeOrgId ?? "");
  const activeMembership = memberships.find((membership) => membership.organizationId === activeId);
  const previousOrganizationId = useRef(activeId);

  useEffect(() => {
    if (previousOrganizationId.current !== activeId) {
      previousOrganizationId.current = activeId;
      queryClient.clear();
    }
  }, [activeId, queryClient]);

  useEffect(() => {
    if (user && memberships.length > 0 && !activeMembership) {
      void user.update({ unsafeMetadata: { ...user.unsafeMetadata, activeOrgId: memberships[0].organizationId } });
    }
  }, [user, memberships, activeMembership]);

  if (!isLoaded) return <CenteredMessage>Loading your workspace…</CenteredMessage>;
  if (!user) {
    return (
      <CenteredMessage>
        <h1 className="text-2xl font-bold">Sign in to your workspace</h1>
        <SignInButton mode="modal"><button className="mt-5 rounded-lg bg-blue-600 px-5 py-3 font-semibold">Sign in</button></SignInButton>
        <Link href="/" className="mt-4 text-sm text-slate-400">Back to home</Link>
      </CenteredMessage>
    );
  }
  if (me.isLoading) return <CenteredMessage>Loading your organizations…</CenteredMessage>;
  if (me.isError) {
    return <CenteredMessage><p>Could not load your account from the API. Check the API, database, and Clerk settings, then retry.</p><button onClick={() => void me.refetch()} className="mt-4 rounded bg-slate-800 px-4 py-2">Retry</button></CenteredMessage>;
  }
  if (memberships.length === 0) return <CreateOrgForm onCreated={async (id) => {
    await user.update({ unsafeMetadata: { ...user.unsafeMetadata, activeOrgId: id } });
    await utils.me.invalidate();
  }} />;
  if (!activeMembership) return <CenteredMessage>Opening your organization…</CenteredMessage>;

  return (
    <div className="flex h-screen bg-slate-950 text-slate-100">
      <aside className="flex w-64 flex-col border-r border-slate-800 p-4">
        <Link href="/app" className="mb-8 block text-xl font-bold hover:text-blue-400">Lumina</Link>
        <nav className="flex-1 space-y-2">
          <NavLink href="/app/chat" icon={<MessageSquare size={18} />}>Chat</NavLink>
          <NavLink href="/app/settings/sources" icon={<Database size={18} />}>Documents</NavLink>
          <NavLink href="/app/settings/team" icon={<Users size={18} />}>Team</NavLink>
        </nav>
        <label className="mb-3 block text-xs text-slate-500" htmlFor="organization">Workspace</label>
        <select
          id="organization"
          value={activeMembership.organizationId}
          onChange={(event) => void user.update({ unsafeMetadata: { ...user.unsafeMetadata, activeOrgId: event.target.value } })}
          className="mb-4 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
        >
          {memberships.map((membership) => <option key={membership.organizationId} value={membership.organizationId}>{membership.organizationName}</option>)}
        </select>
        <div className="flex items-center justify-between border-t border-slate-800 pt-4 text-xs text-slate-400">
          <span className="truncate">{user.primaryEmailAddress?.emailAddress}</span>
          <SignOutButton><button aria-label="Sign out" className="ml-2 rounded p-2 hover:bg-slate-800"><LogOut size={16} /></button></SignOutButton>
        </div>
      </aside>
      <main key={activeMembership.organizationId} className="flex min-w-0 flex-1 flex-col overflow-hidden">{children}</main>
    </div>
  );
}

function CreateOrgForm({ onCreated }: { onCreated: (id: string) => Promise<void> }) {
  const createOrg = trpc.createOrg.useMutation({ onSuccess: async (organization) => onCreated(organization.id) });
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    createOrg.mutate({ name: String(form.get("organizationName") ?? "") });
  };
  return (
    <CenteredMessage>
      <h1 className="text-2xl font-bold">Create your first workspace</h1>
      <p className="mt-2 text-slate-400">A workspace keeps documents, conversations, and members separate.</p>
      <form onSubmit={onSubmit} className="mt-5 flex w-full max-w-md gap-2">
        <input name="organizationName" required minLength={2} maxLength={80} placeholder="Workspace name" className="min-w-0 flex-1 rounded-lg bg-slate-950 px-3 py-2 text-white" />
        <button disabled={createOrg.isPending} className="rounded-lg bg-blue-600 px-4 py-2 font-semibold disabled:opacity-50">{createOrg.isPending ? "Creating…" : "Create"}</button>
      </form>
      {createOrg.error && <p role="alert" className="mt-3 text-sm text-red-400">{createOrg.error.message}</p>}
    </CenteredMessage>
  );
}

function CenteredMessage({ children }: { children: ReactNode }) {
  return <main className="grid min-h-screen place-items-center bg-slate-950 p-6 text-center text-white"><div className="flex flex-col items-center">{children}</div></main>;
}

function NavLink({ href, children, icon }: { href: string; children: ReactNode; icon: ReactNode }) {
  return <Link href={href} className="flex items-center gap-3 rounded px-4 py-2 text-slate-300 transition hover:bg-slate-800">{icon}{children}</Link>;
}
