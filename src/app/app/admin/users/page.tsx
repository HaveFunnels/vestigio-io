"use client";

import { useCallback, useEffect, useState } from "react";
import CustomSelect from "@/components/console/CustomSelect";

// ──────────────────────────────────────────────
// Admin Users Management — invite, role management, removal
// ──────────────────────────────────────────────

/* ---------- Types ---------- */

interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: string;
  createdAt: string;
}

interface AdminUsersResponse {
  users: AdminUser[];
  total: number;
}

/* ---------- Constants ---------- */

const ROLES: { value: string; label: string; description: string }[] = [
  { value: "super_admin", label: "Super Admin", description: "Full access to all admin features" },
  { value: "support", label: "Support", description: "Support Tickets, Feedback" },
  { value: "marketing", label: "Marketing", description: "Marketing, Newsletters" },
  { value: "viewer", label: "Viewer", description: "Read-only access to all sections" },
  { value: "billing", label: "Billing", description: "Usage & Billing, Pricing, Organizations" },
];

const ROLE_COLORS: Record<string, string> = {
  super_admin: "bg-red-500/10 text-red-400 border-red-500/20",
  support: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  marketing: "bg-violet-500/10 text-violet-400 border-violet-500/20",
  viewer: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20",
  billing: "bg-amber-500/10 text-amber-400 border-amber-500/20",
};

/* ---------- Helpers ---------- */

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/* ---------- Icons ---------- */

const icons = {
  plus: (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
    </svg>
  ),
  x: (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  ),
  users: (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
    </svg>
  ),
  shield: (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
    </svg>
  ),
  trash: (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
    </svg>
  ),
};

/* ---------- Skeletons ---------- */

function SkeletonCard() {
  return (
    <div className="relative overflow-hidden rounded-lg border border-edge bg-surface-card p-5">
      <div className="flex items-start justify-between">
        <div className="flex-1 space-y-3">
          <div className="h-3 w-20 animate-pulse rounded bg-white/[0.06]" />
          <div className="h-7 w-24 animate-pulse rounded bg-white/[0.06]" />
          <div className="h-3 w-32 animate-pulse rounded bg-white/[0.06]" />
        </div>
        <div className="h-10 w-10 animate-pulse rounded-lg bg-white/[0.06]" />
      </div>
    </div>
  );
}

function SkeletonRow() {
  return (
    <tr>
      <td className="px-5 py-3"><div className="h-4 w-28 animate-pulse rounded bg-white/[0.06]" /></td>
      <td className="px-5 py-3"><div className="h-4 w-36 animate-pulse rounded bg-white/[0.06]" /></td>
      <td className="px-5 py-3"><div className="h-5 w-20 animate-pulse rounded bg-white/[0.06]" /></td>
      <td className="px-5 py-3"><div className="h-4 w-20 animate-pulse rounded bg-white/[0.06]" /></td>
      <td className="px-5 py-3"><div className="h-4 w-16 animate-pulse rounded bg-white/[0.06]" /></td>
    </tr>
  );
}

/* ---------- Stat Card ---------- */

function StatCard({
  label,
  value,
  sub,
  icon,
  accent,
  loading,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ReactNode;
  accent?: boolean;
  loading?: boolean;
}) {
  if (loading) return <SkeletonCard />;
  return (
    <div className="group relative overflow-hidden rounded-lg border border-edge bg-surface-card p-5 transition-all duration-300 hover:bg-surface-card-hover">
      <div className="flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium uppercase tracking-wider text-content-muted">{label}</p>
          <p className={`mt-2 text-2xl font-bold tracking-tight ${accent ? "text-accent-text" : "text-content"}`}>
            {value}
          </p>
          {sub && <p className="mt-1 text-xs text-content-faint">{sub}</p>}
        </div>
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition-colors ${accent ? "bg-accent/20 text-accent-text" : "bg-surface-inset text-content-muted"}`}>
          {icon}
        </div>
      </div>
    </div>
  );
}

/* ---------- Role Badge ---------- */

function RoleBadge({ role }: { role: string }) {
  const roleInfo = ROLES.find((r) => r.value === role);
  const colorClass = ROLE_COLORS[role] || "bg-surface-inset text-content-muted border-edge";
  return (
    <span className={`inline-block rounded border px-2 py-0.5 text-[11px] font-medium ${colorClass}`}>
      {roleInfo?.label || role}
    </span>
  );
}

/* ---------- Main Page ---------- */

export default function AdminUsersPage() {
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [total, setTotal] = useState(0);

  // Invite modal
  const [showInvite, setShowInvite] = useState(false);
  const [inviteName, setInviteName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [invitePassword, setInvitePassword] = useState("");
  const [inviteRole, setInviteRole] = useState("viewer");
  const [inviteError, setInviteError] = useState("");
  const [saving, setSaving] = useState(false);

  // Inline edit
  const [editingRoleId, setEditingRoleId] = useState<string | null>(null);

  // Confirm remove
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/users");
      if (res.ok) {
        const data: AdminUsersResponse = await res.json();
        setUsers(data.users || []);
        setTotal(data.total || 0);
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  /* ---------- Actions ---------- */

  async function handleInvite() {
    setInviteError("");
    if (!inviteName.trim() || !inviteEmail.trim() || !invitePassword.trim()) {
      setInviteError("Name, email, and password are required.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: inviteName,
          email: inviteEmail,
          password: invitePassword,
          role: inviteRole,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        setInviteError(data.message || "Failed to invite admin.");
        return;
      }
      setInviteName("");
      setInviteEmail("");
      setInvitePassword("");
      setInviteRole("viewer");
      setShowInvite(false);
      fetchUsers();
    } catch {
      setInviteError("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function handleRoleChange(userId: string, newRole: string) {
    try {
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, role: newRole }),
      });
      if (res.ok) {
        setUsers((prev) =>
          prev.map((u) => (u.id === userId ? { ...u, role: newRole } : u))
        );
      }
    } catch {
      // silently fail
    }
    setEditingRoleId(null);
  }

  async function handleRemove(userId: string) {
    try {
      await fetch("/api/admin/users", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      fetchUsers();
    } catch {
      // silently fail
    }
    setConfirmRemoveId(null);
  }

  /* ---------- Computed ---------- */

  const roleCounts: Record<string, number> = {};
  for (const u of users) {
    roleCounts[u.role] = (roleCounts[u.role] || 0) + 1;
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold text-content">Admin Users</h1>
          <p className="mt-1 text-sm text-content-muted">
            Manage admin access, roles, and permissions.
          </p>
        </div>
        <button
          onClick={() => {
            setShowInvite(!showInvite);
            setInviteError("");
            if (!showInvite) {
              setInviteName("");
              setInviteEmail("");
              setInvitePassword("");
              setInviteRole("viewer");
            }
          }}
          className="flex items-center gap-2 rounded-lg bg-accent/20 px-4 py-2 text-sm font-medium text-accent-text transition-colors hover:bg-accent/30"
        >
          {showInvite ? icons.x : icons.plus}
          <span>{showInvite ? "Cancel" : "Invite Admin"}</span>
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard
          label="Total Admins"
          value={loading ? "--" : String(total)}
          icon={icons.users}
          accent
          loading={loading}
        />
        {ROLES.map((role) => (
          <StatCard
            key={role.value}
            label={role.label}
            value={loading ? "--" : String(roleCounts[role.value] || 0)}
            sub={role.description}
            icon={icons.shield}
            loading={loading}
          />
        ))}
      </div>

      {/* Invite Modal */}
      {showInvite && (
        <div className="rounded-lg border border-edge bg-surface-card">
          <div className="border-b border-edge px-5 py-4">
            <h2 className="text-sm font-semibold text-content">Invite New Admin</h2>
          </div>
          <div className="space-y-4 p-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-content-muted">
                  Name
                </label>
                <input
                  type="text"
                  value={inviteName}
                  onChange={(e) => setInviteName(e.target.value)}
                  placeholder="Full name"
                  className="w-full rounded-lg border border-edge bg-surface-inset px-4 py-2.5 text-sm text-content placeholder-content-faint outline-none transition-colors focus:border-accent/40 focus:ring-1 focus:ring-accent/20"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-content-muted">
                  Email
                </label>
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="admin@vestigio.io"
                  className="w-full rounded-lg border border-edge bg-surface-inset px-4 py-2.5 text-sm text-content placeholder-content-faint outline-none transition-colors focus:border-accent/40 focus:ring-1 focus:ring-accent/20"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-content-muted">
                  Password
                </label>
                <input
                  type="password"
                  value={invitePassword}
                  onChange={(e) => setInvitePassword(e.target.value)}
                  placeholder="Temporary password"
                  className="w-full rounded-lg border border-edge bg-surface-inset px-4 py-2.5 text-sm text-content placeholder-content-faint outline-none transition-colors focus:border-accent/40 focus:ring-1 focus:ring-accent/20"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-content-muted">
                  Role
                </label>
                <CustomSelect
                  value={inviteRole}
                  onChange={setInviteRole}
                  options={ROLES.map((r) => ({
                    value: r.value,
                    label: `${r.label} -- ${r.description}`,
                  }))}
                />
              </div>
            </div>

            {inviteError && (
              <div className="rounded-lg border border-red-500/30 bg-red-500/5 px-4 py-2.5 text-sm text-red-400">
                {inviteError}
              </div>
            )}

            <div className="flex justify-end">
              <button
                onClick={handleInvite}
                disabled={saving}
                className="rounded-lg bg-accent/20 px-4 py-2 text-sm font-medium text-accent-text transition-colors hover:bg-accent/30 disabled:opacity-50"
              >
                {saving ? "Inviting..." : "Send Invite"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Users Table */}
      <div className="rounded-lg border border-edge bg-surface-card">
        <div className="flex items-center justify-between border-b border-edge px-5 py-4">
          <h2 className="text-sm font-semibold text-content">All Admin Users</h2>
          {!loading && (
            <span className="text-xs text-content-faint">{total} total</span>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-edge">
                <th className="px-5 py-3 text-xs font-medium uppercase tracking-wider text-content-muted">
                  Name
                </th>
                <th className="px-5 py-3 text-xs font-medium uppercase tracking-wider text-content-muted">
                  Email
                </th>
                <th className="px-5 py-3 text-xs font-medium uppercase tracking-wider text-content-muted">
                  Role
                </th>
                <th className="px-5 py-3 text-xs font-medium uppercase tracking-wider text-content-muted">
                  Created
                </th>
                <th className="px-5 py-3 text-xs font-medium uppercase tracking-wider text-content-muted">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-edge">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} />)
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-12 text-center text-sm text-content-faint">
                    No admin users found. Click &quot;Invite Admin&quot; to add one.
                  </td>
                </tr>
              ) : (
                users.map((user) => (
                  <tr key={user.id} className="hover:bg-surface-card-hover">
                    <td className="px-5 py-3">
                      <p className="text-sm font-medium text-content">{user.name}</p>
                    </td>
                    <td className="px-5 py-3">
                      <p className="text-sm text-content-secondary">{user.email}</p>
                    </td>
                    <td className="px-5 py-3">
                      {editingRoleId === user.id ? (
                        <CustomSelect
                          size="sm"
                          value={user.role}
                          onChange={(val) => {
                            handleRoleChange(user.id, val);
                            setEditingRoleId(null);
                          }}
                          options={ROLES.map((r) => ({
                            value: r.value,
                            label: r.label,
                          }))}
                        />
                      ) : (
                        <button
                          onClick={() => setEditingRoleId(user.id)}
                          className="transition-opacity hover:opacity-80"
                          title="Click to change role"
                        >
                          <RoleBadge role={user.role} />
                        </button>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      <span className="text-xs text-content-faint" title={formatDate(user.createdAt)}>
                        {timeAgo(user.createdAt)}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      {confirmRemoveId === user.id ? (
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-red-400">Remove?</span>
                          <button
                            onClick={() => handleRemove(user.id)}
                            className="rounded px-2 py-1 text-xs font-medium text-red-400 transition-colors hover:bg-red-500/10"
                          >
                            Yes
                          </button>
                          <button
                            onClick={() => setConfirmRemoveId(null)}
                            className="rounded px-2 py-1 text-xs text-content-muted transition-colors hover:bg-surface-inset"
                          >
                            No
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setConfirmRemoveId(user.id)}
                          className="flex items-center gap-1 rounded px-2 py-1 text-xs text-red-400 transition-colors hover:bg-red-500/10"
                          title="Remove admin access"
                        >
                          {icons.trash}
                          <span>Remove</span>
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
