"use client";

// ──────────────────────────────────────────────
// Members — org member management
// In production: CRUD on Membership model.
// ──────────────────────────────────────────────

export default function MembersPage() {
  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-zinc-100">Members</h1>
          <p className="mt-1 text-sm text-zinc-500">Manage team members and roles.</p>
        </div>
        <button className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-500">
          Invite Member
        </button>
      </div>

      <div className="overflow-x-auto rounded-md border border-zinc-800">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-zinc-800 bg-zinc-900/60">
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-zinc-400">Member</th>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-zinc-400">Role</th>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-zinc-400">Joined</th>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-zinc-400">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td colSpan={4} className="px-4 py-8 text-center text-zinc-500">
                Members will appear here after organization activation.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
