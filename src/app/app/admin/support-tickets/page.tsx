"use client";

import { useCallback, useEffect, useState } from "react";

// ──────────────────────────────────────────────
// Admin Support Tickets — mini support platform with reply threads
// ──────────────────────────────────────────────

/* ---------- Types ---------- */

interface SupportTicket {
  id: string;
  ticketNumber: string;
  name: string;
  email: string;
  subject: string;
  message: string;
  category: string;
  priority: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

interface TicketReply {
  id: string;
  ticketId: string;
  senderType: string;
  senderName: string;
  message: string;
  createdAt: string;
}

interface TicketsResponse {
  tickets: SupportTicket[];
  total: number;
  open: number;
  inProgress: number;
  resolved: number;
}

/* ---------- Constants ---------- */

const STATUS_TABS = [
  { value: "", label: "All" },
  { value: "open", label: "Open" },
  { value: "in_progress", label: "In Progress" },
  { value: "resolved", label: "Resolved" },
  { value: "spam", label: "Spam" },
];

const STATUS_COLORS: Record<string, string> = {
  open: "bg-blue-500/10 text-blue-400",
  in_progress: "bg-amber-500/10 text-amber-400",
  resolved: "bg-emerald-500/10 text-emerald-400",
  closed: "bg-zinc-500/10 text-zinc-400",
  spam: "bg-red-500/10 text-red-400",
};

const PRIORITY_COLORS: Record<string, string> = {
  low: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20",
  normal: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  high: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  urgent: "bg-red-500/10 text-red-400 border-red-500/20",
};

const CATEGORY_COLORS: Record<string, string> = {
  general: "bg-zinc-500/10 text-zinc-400",
  bug: "bg-red-500/10 text-red-400",
  feature: "bg-violet-500/10 text-violet-400",
  billing: "bg-amber-500/10 text-amber-400",
  security: "bg-red-500/10 text-red-400",
};

const STATUSES = ["open", "in_progress", "resolved", "closed", "spam"];
const PRIORITIES = ["low", "normal", "high", "urgent"];
const CATEGORIES = ["general", "bug", "feature", "billing", "security"];

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
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatStatus(s: string): string {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/* ---------- Icons ---------- */

const icons = {
  inbox: (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 13.5h3.86a2.25 2.25 0 012.012 1.244l.256.512a2.25 2.25 0 002.013 1.244h3.218a2.25 2.25 0 002.013-1.244l.256-.512a2.25 2.25 0 012.013-1.244h3.859m-17.5 0V6.108c0-1.135.845-2.098 1.976-2.192a48.424 48.424 0 0113.548 0c1.131.094 1.976 1.057 1.976 2.192v7.392" />
    </svg>
  ),
  clock: (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  check: (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  ticket: (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 6v.75m0 3v.75m0 3v.75m0 3V18m-9-5.25h5.25M7.5 15h3M3.375 5.25c-.621 0-1.125.504-1.125 1.125v3.026a2.999 2.999 0 010 5.198v3.026c0 .621.504 1.125 1.125 1.125h17.25c.621 0 1.125-.504 1.125-1.125v-3.026a2.999 2.999 0 010-5.198V6.375c0-.621-.504-1.125-1.125-1.125H3.375z" />
    </svg>
  ),
  x: (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  ),
  send: (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
    </svg>
  ),
  noSymbol: (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
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
        </div>
        <div className="h-10 w-10 animate-pulse rounded-lg bg-white/[0.06]" />
      </div>
    </div>
  );
}

function SkeletonRow() {
  return (
    <tr>
      <td className="px-5 py-3"><div className="h-4 w-16 animate-pulse rounded bg-white/[0.06]" /></td>
      <td className="px-5 py-3"><div className="h-4 w-24 animate-pulse rounded bg-white/[0.06]" /></td>
      <td className="px-5 py-3"><div className="h-4 w-32 animate-pulse rounded bg-white/[0.06]" /></td>
      <td className="px-5 py-3"><div className="h-4 w-40 animate-pulse rounded bg-white/[0.06]" /></td>
      <td className="px-5 py-3"><div className="h-5 w-16 animate-pulse rounded bg-white/[0.06]" /></td>
      <td className="px-5 py-3"><div className="h-5 w-14 animate-pulse rounded bg-white/[0.06]" /></td>
      <td className="px-5 py-3"><div className="h-5 w-18 animate-pulse rounded bg-white/[0.06]" /></td>
      <td className="px-5 py-3"><div className="h-4 w-16 animate-pulse rounded bg-white/[0.06]" /></td>
      <td className="px-5 py-3"><div className="h-4 w-16 animate-pulse rounded bg-white/[0.06]" /></td>
    </tr>
  );
}

/* ---------- Stat Card ---------- */

function StatCard({
  label,
  value,
  icon,
  accent,
  warn,
  danger,
  loading,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  accent?: boolean;
  warn?: boolean;
  danger?: boolean;
  loading?: boolean;
}) {
  if (loading) return <SkeletonCard />;
  return (
    <div className="group relative overflow-hidden rounded-lg border border-edge bg-surface-card p-5 transition-all duration-300 hover:bg-surface-card-hover">
      <div className="flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium uppercase tracking-wider text-content-muted">{label}</p>
          <p className={`mt-2 text-2xl font-bold tracking-tight ${danger ? "text-red-400" : warn ? "text-amber-400" : accent ? "text-accent-text" : "text-content"}`}>
            {value}
          </p>
        </div>
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition-colors ${danger ? "bg-red-500/10 text-red-400" : warn ? "bg-amber-500/10 text-amber-400" : accent ? "bg-accent/20 text-accent-text" : "bg-surface-inset text-content-muted"}`}>
          {icon}
        </div>
      </div>
    </div>
  );
}

/* ---------- Main Page ---------- */

export default function AdminSupportTicketsPage() {
  const [loading, setLoading] = useState(true);
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [total, setTotal] = useState(0);
  const [openCount, setOpenCount] = useState(0);
  const [inProgressCount, setInProgressCount] = useState(0);
  const [resolvedCount, setResolvedCount] = useState(0);

  // Filters
  const [statusFilter, setStatusFilter] = useState("");

  // Detail panel
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null);
  const [replies, setReplies] = useState<TicketReply[]>([]);
  const [repliesLoading, setRepliesLoading] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [sendingReply, setSendingReply] = useState(false);
  const [updatingTicket, setUpdatingTicket] = useState(false);

  const fetchTickets = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set("status", statusFilter);
      const res = await fetch(`/api/admin/support-tickets?${params}`);
      if (res.ok) {
        const data: TicketsResponse = await res.json();
        setTickets(data.tickets || []);
        setTotal(data.total || 0);
        setOpenCount(data.open || 0);
        setInProgressCount(data.inProgress || 0);
        setResolvedCount(data.resolved || 0);
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    fetchTickets();
  }, [fetchTickets]);

  const fetchReplies = useCallback(async (ticketId: string) => {
    setRepliesLoading(true);
    try {
      const res = await fetch(`/api/admin/support-tickets/${ticketId}/replies`);
      if (res.ok) {
        const data = await res.json();
        setReplies(data.replies || []);
      }
    } catch {
      // silently fail
    } finally {
      setRepliesLoading(false);
    }
  }, []);

  function openTicket(ticket: SupportTicket) {
    setSelectedTicket(ticket);
    setReplyText("");
    setReplies([]);
    fetchReplies(ticket.id);
  }

  function closePanel() {
    setSelectedTicket(null);
    setReplies([]);
    setReplyText("");
  }

  /* ---------- Actions ---------- */

  async function handleSendReply() {
    if (!selectedTicket || !replyText.trim()) return;
    setSendingReply(true);
    try {
      const res = await fetch(`/api/admin/support-tickets/${selectedTicket.id}/replies`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: replyText }),
      });
      if (res.ok) {
        setReplyText("");
        fetchReplies(selectedTicket.id);
      }
    } catch {
      // silently fail
    } finally {
      setSendingReply(false);
    }
  }

  async function handleUpdateTicket(field: string, value: string) {
    if (!selectedTicket) return;
    setUpdatingTicket(true);
    try {
      const res = await fetch(`/api/admin/support-tickets`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticketId: selectedTicket.id, [field]: value }),
      });
      if (res.ok) {
        const updated = { ...selectedTicket, [field]: value, updatedAt: new Date().toISOString() };
        setSelectedTicket(updated);
        setTickets((prev) =>
          prev.map((t) => (t.id === selectedTicket.id ? updated : t))
        );
      }
    } catch {
      // silently fail
    } finally {
      setUpdatingTicket(false);
    }
  }

  async function handleMarkSpam() {
    if (!selectedTicket) return;
    await handleUpdateTicket("status", "spam");
  }

  /* ---------- Computed ---------- */

  const resolvedToday = tickets.filter((t) => {
    if (t.status !== "resolved") return false;
    const updated = new Date(t.updatedAt);
    const today = new Date();
    return (
      updated.getDate() === today.getDate() &&
      updated.getMonth() === today.getMonth() &&
      updated.getFullYear() === today.getFullYear()
    );
  }).length;

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold text-content">Support Tickets</h1>
          <div className="flex items-center gap-2 text-xs text-content-faint">
            <span className="rounded bg-blue-500/10 px-2 py-0.5 text-blue-400">{openCount} Open</span>
            <span className="rounded bg-amber-500/10 px-2 py-0.5 text-amber-400">{inProgressCount} In Progress</span>
            <span className="rounded bg-emerald-500/10 px-2 py-0.5 text-emerald-400">{resolvedCount} Resolved</span>
          </div>
        </div>
        <p className="mt-1 text-sm text-content-muted">
          Manage customer support tickets, reply to users, and track resolution.
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard
          label="Open"
          value={loading ? "--" : String(openCount)}
          icon={icons.inbox}
          danger
          loading={loading}
        />
        <StatCard
          label="In Progress"
          value={loading ? "--" : String(inProgressCount)}
          icon={icons.clock}
          warn
          loading={loading}
        />
        <StatCard
          label="Resolved Today"
          value={loading ? "--" : String(resolvedToday)}
          icon={icons.check}
          accent
          loading={loading}
        />
        <StatCard
          label="Total"
          value={loading ? "--" : String(total)}
          icon={icons.ticket}
          loading={loading}
        />
      </div>

      {/* Tab bar */}
      <div className="flex rounded-lg border border-edge bg-surface-card p-0.5">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setStatusFilter(tab.value)}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              statusFilter === tab.value
                ? "bg-accent/20 text-accent-text"
                : "text-content-muted hover:text-content"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Main content: table + detail panel */}
      <div className="flex gap-6">
        {/* Table */}
        <div className={`rounded-lg border border-edge bg-surface-card ${selectedTicket ? "flex-1 min-w-0" : "w-full"}`}>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-edge">
                  <th className="px-5 py-3 text-xs font-medium uppercase tracking-wider text-content-muted">Ticket#</th>
                  <th className="px-5 py-3 text-xs font-medium uppercase tracking-wider text-content-muted">Name</th>
                  <th className="px-5 py-3 text-xs font-medium uppercase tracking-wider text-content-muted">Email</th>
                  <th className="px-5 py-3 text-xs font-medium uppercase tracking-wider text-content-muted">Subject</th>
                  <th className="px-5 py-3 text-xs font-medium uppercase tracking-wider text-content-muted">Category</th>
                  <th className="px-5 py-3 text-xs font-medium uppercase tracking-wider text-content-muted">Priority</th>
                  <th className="px-5 py-3 text-xs font-medium uppercase tracking-wider text-content-muted">Status</th>
                  <th className="px-5 py-3 text-xs font-medium uppercase tracking-wider text-content-muted">Created</th>
                  <th className="px-5 py-3 text-xs font-medium uppercase tracking-wider text-content-muted">Updated</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-edge">
                {loading ? (
                  Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} />)
                ) : tickets.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-5 py-12 text-center text-sm text-content-faint">
                      No tickets found for this filter.
                    </td>
                  </tr>
                ) : (
                  tickets.map((ticket) => (
                    <tr
                      key={ticket.id}
                      onClick={() => openTicket(ticket)}
                      className={`cursor-pointer transition-colors hover:bg-surface-card-hover ${
                        selectedTicket?.id === ticket.id ? "bg-surface-card-hover" : ""
                      }`}
                    >
                      <td className="whitespace-nowrap px-5 py-3 font-mono text-xs text-content-muted">
                        {ticket.ticketNumber}
                      </td>
                      <td className="px-5 py-3 text-sm font-medium text-content">
                        {ticket.name}
                      </td>
                      <td className="px-5 py-3 text-sm text-content-secondary">
                        {ticket.email}
                      </td>
                      <td className="max-w-[200px] truncate px-5 py-3 text-sm text-content">
                        {ticket.subject}
                      </td>
                      <td className="px-5 py-3">
                        <span className={`inline-block rounded px-2 py-0.5 text-[11px] font-medium ${CATEGORY_COLORS[ticket.category] || CATEGORY_COLORS.general}`}>
                          {ticket.category}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <span className={`inline-block rounded border px-2 py-0.5 text-[11px] font-medium ${PRIORITY_COLORS[ticket.priority] || PRIORITY_COLORS.normal}`}>
                          {ticket.priority}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <span className={`inline-block rounded px-2 py-0.5 text-[11px] font-medium ${STATUS_COLORS[ticket.status] || STATUS_COLORS.open}`}>
                          {formatStatus(ticket.status)}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-5 py-3 text-xs text-content-faint">
                        {timeAgo(ticket.createdAt)}
                      </td>
                      <td className="whitespace-nowrap px-5 py-3 text-xs text-content-faint">
                        {timeAgo(ticket.updatedAt)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Detail Panel */}
        {selectedTicket && (
          <div className="w-[420px] shrink-0 space-y-4">
            <div className="rounded-lg border border-edge bg-surface-card">
              {/* Panel header */}
              <div className="flex items-center justify-between border-b border-edge px-5 py-4">
                <div>
                  <h2 className="text-sm font-semibold text-content">
                    {selectedTicket.subject}
                  </h2>
                  <p className="mt-0.5 text-xs text-content-faint">
                    {selectedTicket.ticketNumber} -- {selectedTicket.name} ({selectedTicket.email})
                  </p>
                </div>
                <button
                  onClick={closePanel}
                  className="text-content-faint transition-colors hover:text-content"
                >
                  {icons.x}
                </button>
              </div>

              {/* Full message */}
              <div className="border-b border-edge px-5 py-4">
                <p className="text-xs font-medium uppercase tracking-wider text-content-muted">Message</p>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-content">
                  {selectedTicket.message}
                </p>
              </div>

              {/* Update controls */}
              <div className="border-b border-edge px-5 py-4">
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-content-muted">
                      Status
                    </label>
                    <select
                      value={selectedTicket.status}
                      onChange={(e) => handleUpdateTicket("status", e.target.value)}
                      disabled={updatingTicket}
                      className="w-full rounded-lg border border-edge bg-surface-inset px-2 py-1.5 text-xs text-content outline-none focus:border-accent/40 disabled:opacity-50"
                    >
                      {STATUSES.map((s) => (
                        <option key={s} value={s}>{formatStatus(s)}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-content-muted">
                      Priority
                    </label>
                    <select
                      value={selectedTicket.priority}
                      onChange={(e) => handleUpdateTicket("priority", e.target.value)}
                      disabled={updatingTicket}
                      className="w-full rounded-lg border border-edge bg-surface-inset px-2 py-1.5 text-xs text-content outline-none focus:border-accent/40 disabled:opacity-50"
                    >
                      {PRIORITIES.map((p) => (
                        <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-content-muted">
                      Category
                    </label>
                    <select
                      value={selectedTicket.category}
                      onChange={(e) => handleUpdateTicket("category", e.target.value)}
                      disabled={updatingTicket}
                      className="w-full rounded-lg border border-edge bg-surface-inset px-2 py-1.5 text-xs text-content outline-none focus:border-accent/40 disabled:opacity-50"
                    >
                      {CATEGORIES.map((c) => (
                        <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <span className="text-[10px] text-content-faint">
                    Created {formatDate(selectedTicket.createdAt)}
                  </span>
                  <span className="text-content-faint">|</span>
                  <span className="text-[10px] text-content-faint">
                    Updated {formatDate(selectedTicket.updatedAt)}
                  </span>
                </div>
                {selectedTicket.status !== "spam" && (
                  <button
                    onClick={handleMarkSpam}
                    className="mt-3 flex items-center gap-1.5 rounded px-2.5 py-1.5 text-xs text-red-400 transition-colors hover:bg-red-500/10"
                  >
                    {icons.noSymbol}
                    <span>Mark as Spam</span>
                  </button>
                )}
              </div>

              {/* Reply thread */}
              <div className="border-b border-edge px-5 py-4">
                <p className="text-xs font-medium uppercase tracking-wider text-content-muted">
                  Replies
                </p>
                <div className="mt-3 space-y-3">
                  {repliesLoading ? (
                    <div className="space-y-3">
                      {Array.from({ length: 2 }).map((_, i) => (
                        <div key={i} className="space-y-2 rounded-lg border border-edge bg-surface-inset p-3">
                          <div className="h-3 w-24 animate-pulse rounded bg-white/[0.06]" />
                          <div className="h-3 w-full animate-pulse rounded bg-white/[0.06]" />
                          <div className="h-3 w-3/4 animate-pulse rounded bg-white/[0.06]" />
                        </div>
                      ))}
                    </div>
                  ) : replies.length === 0 ? (
                    <p className="text-xs text-content-faint">No replies yet.</p>
                  ) : (
                    replies.map((reply) => (
                      <div
                        key={reply.id}
                        className={`rounded-lg border p-3 ${
                          reply.senderType === "admin"
                            ? "border-accent/20 bg-accent/5"
                            : "border-edge bg-surface-inset"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium text-content">
                            {reply.senderName}
                          </span>
                          <span className="text-[10px] text-content-faint">
                            {timeAgo(reply.createdAt)}
                          </span>
                        </div>
                        <p className="mt-1.5 whitespace-pre-wrap text-xs leading-relaxed text-content-secondary">
                          {reply.message}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Reply composer */}
              <div className="px-5 py-4">
                <textarea
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  placeholder="Type your reply..."
                  rows={3}
                  className="w-full rounded-lg border border-edge bg-surface-inset px-3 py-2 text-sm text-content placeholder-content-faint outline-none transition-colors focus:border-accent/40 focus:ring-1 focus:ring-accent/20"
                />
                <div className="mt-2 flex justify-end">
                  <button
                    onClick={handleSendReply}
                    disabled={sendingReply || !replyText.trim()}
                    className="flex items-center gap-2 rounded-lg bg-accent/20 px-4 py-2 text-sm font-medium text-accent-text transition-colors hover:bg-accent/30 disabled:opacity-50"
                  >
                    {icons.send}
                    <span>{sendingReply ? "Sending..." : "Send Reply"}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
