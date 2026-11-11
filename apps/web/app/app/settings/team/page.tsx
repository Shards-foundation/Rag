'use client';
import { trpc } from "../../../../lib/trpc";
import { Shield, User as UserIcon } from "lucide-react";

export default function TeamPage() {
  const members = trpc.team.list.useQuery();

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Team Members</h1>
      </div>

      <div className="bg-slate-900 rounded-lg border border-slate-800 overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-slate-800 text-slate-400 text-xs uppercase tracking-wider">
            <tr>
              <th className="p-4">User</th>
              <th className="p-4">Email</th>
              <th className="p-4">Role</th>
              <th className="p-4">Joined</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {members.data?.map((m) => (
              <tr key={m.id} className="hover:bg-slate-800/50 transition">
                <td className="p-4 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-slate-300">
                    <UserIcon size={14} />
                  </div>
                  <span className="font-medium">{m.user?.name || "Unknown"}</span>
                </td>
                <td className="p-4 text-slate-400">{m.user?.email}</td>
                <td className="p-4">
                  <span className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${
                    m.role === 'ADMIN' ? 'bg-purple-900 text-purple-200' : 'bg-slate-800 text-slate-300'
                  }`}>
                    {m.role === 'ADMIN' && <Shield size={10} />}
                    {m.role}
                  </span>
                </td>
                <td className="p-4 text-slate-500 text-sm">
                  {new Date(m.createdAt).toLocaleDateString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
