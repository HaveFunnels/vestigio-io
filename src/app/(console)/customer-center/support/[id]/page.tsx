"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import toast from "react-hot-toast";

// ──────────────────────────────────────────────
// Ticket Detail — View ticket + reply thread
//
// Reply content from admin is sanitized server-side
// (allowed: b, i, p, br, ul, ol, li, a)
// ──────────────────────────────────────────────

interface Ticket {
  id: string;
  subject: string;
  message: string;
  status: string;
  priority: string;
  category: string;
  createdAt: string;
  updatedAt: string;
}

interface Reply {
  id: string;
  authorName: string;
  authorEmail: string;
  content: string;
  isStaff: boolean;
  createdAt: string;
}

const statusStyles: Record<string, string> = {
  open: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
  in_progress: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
  resolved: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
  closed: "bg-zinc-500/10 text-content-muted border-zinc-500/20",
};

export default function TicketDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { data: session } = useSession();
  const t = useTranslations("console.customer_center.support");
  const ticketId = params.id as string;

  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [replies, setReplies] = useState<Reply[]>([]);
  const [loading, setLoading] = useState(true);
  const [replyText, setReplyText] = useState("");
  const [sending, setSending] = useState(false);

  const fetchTicket = useCallback(async () => {
    try {
      const [ticketRes, repliesRes] = await Promise.all([
        fetch(`/api/support-tickets/${ticketId}`),
        fetch(`/api/support-tickets/${ticketId}/replies`),
      ]);
      if (ticketRes.ok) {
        const data = await ticketRes.json();
        setTicket(data.ticket);
      }
      if (repliesRes.ok) {
        const data = await repliesRes.json();
        setReplies(data.replies || []);
      }
    } catch { /* continue */ }
    finally { setLoading(false); }
  }, [ticketId]);

  useEffect(() => { fetchTicket(); }, [fetchTicket]);

  const handleReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyText.trim()) return;
    setSending(true);

    try {
      const res = await fetch(`/api/support-tickets/${ticketId}/replies`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: replyText.trim() }),
      });

      if (res.ok) {
        setReplyText("");
        fetchTicket();
        toast.success(t("reply_sent"));
      } else {
        toast.error(t("error"));
      }
    } catch {
      toast.error(t("error"));
    } finally {
      setSending(false);
    }
  };

  // Render reply content safely — staff replies have sanitized HTML
  function renderReplyContent(reply: Reply) {
    if (reply.isStaff) {
      // Staff replies are sanitized server-side (allowed: b,i,p,br,ul,ol,li,a)
      return <div className="text-sm leading-relaxed text-content-secondary [&_a]:text-accent [&_a]:underline" dangerouslySetInnerHTML={{ __html: reply.content }} />;
    }
    // User replies are plain text
    return <p className="whitespace-pre-wrap text-sm leading-relaxed text-content-secondary">{reply.content}</p>;
  }

  if (loading) {
    return (
      <div className="p-6">
        <div className="mx-auto max-w-3xl space-y-4">
          <div className="h-6 w-48 animate-pulse rounded bg-surface-inset" />
          <div className="h-32 animate-pulse rounded-lg bg-surface-inset" />
        </div>
      </div>
    );
  }

  if (!ticket) {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <p className="text-sm text-content-muted">{t("not_found")}</p>
        <button onClick={() => router.push("/app/customer-center/support")}
          className="mt-4 rounded-lg border border-edge px-4 py-2 text-sm text-content-secondary hover:bg-surface-card-hover">
          {t("back")}
        </button>
      </div>
    );
  }

  const isClosed = ticket.status === "resolved" || ticket.status === "closed";

  return (
    <div className="p-6">
      <div className="mx-auto max-w-3xl">
        {/* Back + Header */}
        <div className="mb-6">
          <button
            onClick={() => router.push("/app/customer-center/support")}
            className="mb-4 flex items-center gap-1 text-xs text-content-muted transition-colors hover:text-content-secondary"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
            {t("back")}
          </button>

          <div className="flex items-start justify-between gap-4">
            <h1 className="text-lg font-semibold text-content">{ticket.subject}</h1>
            <span className={`shrink-0 rounded border px-2 py-0.5 text-xs font-semibold ${statusStyles[ticket.status] || statusStyles.open}`}>
              {t(`statuses.${ticket.status}`)}
            </span>
          </div>

          <div className="mt-2 flex items-center gap-3 text-xs text-content-faint">
            <span>{t(`categories.${ticket.category}`)}</span>
            <span>{new Date(ticket.createdAt).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}</span>
          </div>
        </div>

        {/* Original message */}
        <div className="mb-6 rounded-lg border border-edge bg-surface-card p-5">
          <div className="mb-2 flex items-center gap-2 text-xs text-content-faint">
            <span className="font-medium text-content-secondary">{session?.user?.name || "You"}</span>
            <span>{new Date(ticket.createdAt).toLocaleString()}</span>
          </div>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-content-secondary">{ticket.message}</p>
        </div>

        {/* Reply thread */}
        {replies.length > 0 && (
          <div className="mb-6 space-y-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-content-muted">{t("conversation")}</h2>
            {replies.map((reply) => (
              <div
                key={reply.id}
                className={`rounded-lg border p-4 ${
                  reply.isStaff
                    ? "border-emerald-500/20 bg-emerald-500/5"
                    : "border-edge bg-surface-card"
                }`}
              >
                <div className="mb-2 flex items-center gap-2 text-xs">
                  {reply.isStaff && (
                    <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                      {t("staff")}
                    </span>
                  )}
                  <span className="font-medium text-content-secondary">{reply.authorName}</span>
                  <span className="text-content-faint">{new Date(reply.createdAt).toLocaleString()}</span>
                </div>
                {renderReplyContent(reply)}
              </div>
            ))}
          </div>
        )}

        {/* Reply form */}
        {!isClosed ? (
          <form onSubmit={handleReply} className="rounded-lg border border-edge bg-surface-card p-4">
            <label className="mb-2 block text-xs font-medium text-content-muted">{t("add_reply")}</label>
            <textarea
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              placeholder={t("reply_placeholder")}
              rows={4}
              className="w-full rounded-md border border-edge bg-surface-inset px-3 py-2 text-sm text-content-secondary placeholder:text-content-faint focus:border-accent/50 focus:outline-none focus:ring-1 focus:ring-accent/30 resize-none"
              maxLength={5000}
            />
            <div className="mt-3 flex justify-end">
              <button
                type="submit"
                disabled={sending || !replyText.trim()}
                className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent/90 disabled:opacity-50"
              >
                {sending ? t("form.submitting") : t("send_reply")}
              </button>
            </div>
          </form>
        ) : (
          <div className="rounded-lg border border-edge bg-surface-card/50 p-4 text-center text-sm text-content-faint">
            {t("ticket_closed")}
          </div>
        )}
      </div>
    </div>
  );
}
