"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import toast from "react-hot-toast";

// ──────────────────────────────────────────────
// Support — Authenticated ticket management
// ──────────────────────────────────────────────

interface Ticket {
  id: string;
  subject: string;
  message: string;
  status: string;
  priority: string;
  category: string;
  replyCount: number;
  createdAt: string;
  updatedAt: string;
}

const statusStyles: Record<string, string> = {
  open: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
  in_progress: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
  resolved: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
  closed: "bg-zinc-500/10 text-content-muted border-zinc-500/20",
};

const categoryOptions = ["general", "bug", "feature", "billing", "security"];

export default function SupportPage() {
  const t = useTranslations("console.customer_center.support");
  const { data: session } = useSession();
  const router = useRouter();

  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Form state
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [category, setCategory] = useState("general");

  const fetchTickets = useCallback(async () => {
    try {
      const res = await fetch("/api/support-tickets?limit=50");
      if (res.ok) {
        const data = await res.json();
        setTickets(data.tickets || []);
      }
    } catch { /* continue */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchTickets(); }, [fetchTickets]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject.trim() || !message.trim()) return;
    setSubmitting(true);

    try {
      const res = await fetch("/api/support-tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: session?.user?.name || "User",
          email: session?.user?.email || "",
          subject: subject.trim(),
          message: message.trim(),
          category,
        }),
      });

      if (res.ok) {
        toast.success(t("ticket_created"));
        setSubject("");
        setMessage("");
        setCategory("general");
        setShowForm(false);
        fetchTickets();
      } else {
        const data = await res.json();
        toast.error(data.message || t("error"));
      }
    } catch {
      toast.error(t("error"));
    } finally {
      setSubmitting(false);
    }
  };

  const openCount = tickets.filter((t) => t.status === "open" || t.status === "in_progress").length;
  const resolvedCount = tickets.filter((t) => t.status === "resolved" || t.status === "closed").length;

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push("/app/customer-center")}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-edge text-content-muted transition-colors hover:bg-surface-card-hover"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
          </button>
          <div>
            <h1 className="text-xl font-semibold text-content">{t("title")}</h1>
            <p className="text-sm text-content-muted">{t("subtitle")}</p>
          </div>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent/90"
        >
          {showForm ? t("cancel") : t("new_ticket")}
        </button>
      </div>

      {/* Stats */}
      <div className="mb-6 grid grid-cols-3 gap-4">
        <div className="rounded-lg border border-edge bg-surface-card p-4 text-center">
          <div className="text-2xl font-bold text-content">{tickets.length}</div>
          <div className="text-xs text-content-muted">{t("stats.total")}</div>
        </div>
        <div className="rounded-lg border border-edge bg-surface-card p-4 text-center">
          <div className="text-2xl font-bold text-blue-500">{openCount}</div>
          <div className="text-xs text-content-muted">{t("stats.open")}</div>
        </div>
        <div className="rounded-lg border border-edge bg-surface-card p-4 text-center">
          <div className="text-2xl font-bold text-emerald-500">{resolvedCount}</div>
          <div className="text-xs text-content-muted">{t("stats.resolved")}</div>
        </div>
      </div>

      {/* New Ticket Form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="mb-6 rounded-lg border border-accent/20 bg-surface-card p-5 space-y-4">
          <h2 className="text-sm font-semibold text-content">{t("form.title")}</h2>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-content-muted">{t("form.subject")}</label>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder={t("form.subject_placeholder")}
                className="w-full rounded-md border border-edge bg-surface-inset px-3 py-2 text-sm text-content-secondary placeholder:text-content-faint focus:border-accent/50 focus:outline-none focus:ring-1 focus:ring-accent/30"
                required
                maxLength={200}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-content-muted">{t("form.category")}</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full rounded-md border border-edge bg-surface-inset px-3 py-2 text-sm text-content-secondary focus:border-accent/50 focus:outline-none focus:ring-1 focus:ring-accent/30"
              >
                {categoryOptions.map((cat) => (
                  <option key={cat} value={cat}>{t(`categories.${cat}`)}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-content-muted">{t("form.message")}</label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={t("form.message_placeholder")}
              rows={5}
              className="w-full rounded-md border border-edge bg-surface-inset px-3 py-2 text-sm text-content-secondary placeholder:text-content-faint focus:border-accent/50 focus:outline-none focus:ring-1 focus:ring-accent/30 resize-none"
              required
              maxLength={5000}
            />
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={submitting || !subject.trim() || !message.trim()}
              className="rounded-lg bg-accent px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-accent/90 disabled:opacity-50"
            >
              {submitting ? t("form.submitting") : t("form.submit")}
            </button>
          </div>
        </form>
      )}

      {/* Ticket List */}
      {loading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="rounded-lg border border-edge bg-surface-card p-4">
              <div className="h-4 w-2/3 animate-pulse rounded bg-surface-inset" />
              <div className="mt-2 h-3 w-1/3 animate-pulse rounded bg-surface-inset" />
            </div>
          ))}
        </div>
      ) : tickets.length === 0 ? (
        <div className="py-16 text-center">
          <svg className="mx-auto h-10 w-10 text-content-faint" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
          </svg>
          <p className="mt-3 text-sm text-content-muted">{t("empty")}</p>
          <button
            onClick={() => setShowForm(true)}
            className="mt-4 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent/90"
          >
            {t("new_ticket")}
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {tickets.map((ticket) => (
            <button
              key={ticket.id}
              onClick={() => router.push(`/app/customer-center/support/${ticket.id}`)}
              className="flex w-full items-center gap-4 rounded-lg border border-edge bg-surface-card p-4 text-left transition-all hover:border-accent/20 hover:shadow-sm"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-content-secondary truncate">{ticket.subject}</span>
                  <span className={`shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-semibold ${statusStyles[ticket.status] || statusStyles.open}`}>
                    {t(`statuses.${ticket.status}`)}
                  </span>
                </div>
                <div className="mt-1 flex items-center gap-3 text-xs text-content-faint">
                  <span>{t(`categories.${ticket.category}`)}</span>
                  <span>{new Date(ticket.createdAt).toLocaleDateString()}</span>
                  {ticket.replyCount > 0 && (
                    <span className="flex items-center gap-1">
                      <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12" />
                      </svg>
                      {ticket.replyCount} {ticket.replyCount === 1 ? t("reply") : t("replies")}
                    </span>
                  )}
                </div>
              </div>
              <svg className="h-4 w-4 shrink-0 text-content-faint" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
              </svg>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
