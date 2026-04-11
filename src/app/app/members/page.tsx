"use client";

import { useCallback, useEffect, useState } from "react";
import InviteMemberModal from "@/components/app/InviteMemberModal";

// ──────────────────────────────────────────────
// Members — org member management + pending invites
// ──────────────────────────────────────────────

interface Member {
  id: string;
  userId: string;
  name: string | null;
  email: string | null;
  image: string | null;
  role: string;
  createdAt: string;
}

interface Invite {
  id: string;
  email: string;
  role: string;
  status: string;
  expiresAt: string;
  createdAt: string;
}

export default function MembersPage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [currentUserRole, setCurrentUserRole] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [membersRes, invitesRes] = await Promise.all([
        fetch("/api/organization/members"),
        fetch("/api/organization/invites"),
      ]);

      if (membersRes.ok) {
        const data = await membersRes.json();
        setMembers(data.members || []);
      }

      if (invitesRes.ok) {
        const data = await invitesRes.json();
        setInvites(data.invites || []);
      }

      // Determine current user role from org endpoint
      const orgRes = await fetch("/api/organization");
      if (orgRes.ok) {
        const orgData = await orgRes.json();
        setCurrentUserRole(orgData.currentUserRole);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const canManage = currentUserRole === "owner" || currentUserRole === "admin";

  async function handleRoleChange(membershipId: string, newRole: string) {
    setActionLoading(membershipId);
    try {
      const res = await fetch("/api/organization/members", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ membershipId, role: newRole }),
      });
      if (res.ok) {
        await fetchData();
      }
    } catch {
      // silent
    } finally {
      setActionLoading(null);
    }
  }

  async function handleRemoveMember(membershipId: string) {
    if (!confirm("Are you sure you want to remove this member?")) return;
    setActionLoading(membershipId);
    try {
      const res = await fetch("/api/organization/members", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ membershipId }),
      });
      if (res.ok) {
        await fetchData();
      }
    } catch {
      // silent
    } finally {
      setActionLoading(null);
    }
  }

  async function handleRevokeInvite(inviteId: string) {
    setActionLoading(inviteId);
    try {
      const res = await fetch("/api/organization/invites", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inviteId }),
      });
      if (res.ok) {
        await fetchData();
      }
    } catch {
      // silent
    } finally {
      setActionLoading(null);
    }
  }

  const pendingInvites = invites.filter(
    (inv) => inv.status === "pending" && new Date(inv.expiresAt) > new Date(),
  );

  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  function roleLabel(role: string) {
    return role.charAt(0).toUpperCase() + role.slice(1);
  }

  function roleBadgeClass(role: string) {
    switch (role) {
      case "owner":
        return "bg-amber-500/15 text-amber-400 border-amber-500/30";
      case "admin":
        return "bg-blue-500/15 text-blue-400 border-blue-500/30";
      case "viewer":
        return "bg-zinc-500/15 text-zinc-400 border-zinc-500/30";
      default:
        return "bg-emerald-500/15 text-emerald-400 border-emerald-500/30";
    }
  }

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-content">Members</h1>
          <p className="mt-1 text-sm text-content-muted">
            Manage team members and roles.
          </p>
        </div>
        {canManage && (
          <button
            onClick={() => setShowInviteModal(true)}
            className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-500"
          >
            Invite Member
          </button>
        )}
      </div>

      {/* Members table */}
      <div className="overflow-x-auto rounded-md border border-edge">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-edge bg-surface-card">
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-content-muted">
                Member
              </th>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-content-muted">
                Role
              </th>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-content-muted">
                Joined
              </th>
              {canManage && (
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-content-muted">
                  Actions
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={canManage ? 4 : 3} className="px-4 py-8 text-center text-content-muted">
                  Loading members...
                </td>
              </tr>
            ) : members.length === 0 ? (
              <tr>
                <td colSpan={canManage ? 4 : 3} className="px-4 py-8 text-center text-content-muted">
                  No members yet.
                </td>
              </tr>
            ) : (
              members.map((member) => (
                <tr key={member.id} className="border-b border-edge last:border-b-0">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      {member.image ? (
                        <img
                          src={member.image}
                          alt=""
                          className="h-8 w-8 rounded-full"
                        />
                      ) : (
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500/20 text-xs font-medium text-emerald-400">
                          {(member.name || member.email || "?").charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div>
                        <div className="font-medium text-content">
                          {member.name || "Unnamed"}
                        </div>
                        <div className="text-xs text-content-muted">
                          {member.email}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-medium ${roleBadgeClass(member.role)}`}
                    >
                      {roleLabel(member.role)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-content-muted">
                    {formatDate(member.createdAt)}
                  </td>
                  {canManage && (
                    <td className="px-4 py-3">
                      {member.role !== "owner" ? (
                        <div className="flex items-center gap-2">
                          <select
                            value={member.role}
                            onChange={(e) => handleRoleChange(member.id, e.target.value)}
                            disabled={actionLoading === member.id}
                            className="rounded border border-edge bg-surface px-2 py-1 text-xs text-content focus:border-emerald-500 focus:outline-none"
                          >
                            {currentUserRole === "owner" && (
                              <option value="admin">Admin</option>
                            )}
                            <option value="member">Member</option>
                            <option value="viewer">Viewer</option>
                          </select>
                          <button
                            onClick={() => handleRemoveMember(member.id)}
                            disabled={actionLoading === member.id}
                            className="rounded px-2 py-1 text-xs text-red-400 transition-colors hover:bg-red-500/10 disabled:opacity-50"
                          >
                            Remove
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs text-content-muted">--</span>
                      )}
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pending invites */}
      {canManage && pendingInvites.length > 0 && (
        <div className="mt-8">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-content-muted">
            Pending Invites
          </h2>
          <div className="overflow-x-auto rounded-md border border-edge">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-edge bg-surface-card">
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-content-muted">
                    Email
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-content-muted">
                    Role
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-content-muted">
                    Expires
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-content-muted">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {pendingInvites.map((invite) => (
                  <tr key={invite.id} className="border-b border-edge last:border-b-0">
                    <td className="px-4 py-3 text-content">{invite.email}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-medium ${roleBadgeClass(invite.role)}`}
                      >
                        {roleLabel(invite.role)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-content-muted">
                      {formatDate(invite.expiresAt)}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => handleRevokeInvite(invite.id)}
                        disabled={actionLoading === invite.id}
                        className="rounded px-2 py-1 text-xs text-red-400 transition-colors hover:bg-red-500/10 disabled:opacity-50"
                      >
                        Revoke
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <InviteMemberModal
        isOpen={showInviteModal}
        onClose={() => setShowInviteModal(false)}
        onInvited={fetchData}
      />
    </div>
  );
}
