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
          <h1 className="text-xl font-semibold text-content">Members</h1>
          <p className="mt-1 text-sm text-content-muted">Manage team members and roles.</p>
        </div>
        <button className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-500">
          Invite Member
        </button>
      </div>

      <div className="overflow-x-auto rounded-md border border-edge">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-edge bg-surface-card">
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-content-muted">Member</th>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-content-muted">Role</th>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-content-muted">Joined</th>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-content-muted">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td colSpan={4} className="px-4 py-8 text-center text-content-muted">
                Members will appear here after organization activation.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
