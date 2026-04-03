"use client";

import { useState, useEffect, useCallback, useRef } from "react";

// ──────────────────────────────────────────────
// Admin Newsletters — rich editor, templates, compose, list, send
// ──────────────────────────────────────────────

/* ---------- Types ---------- */

interface Newsletter {
  id: string;
  subject: string;
  content: string;
  audience: string;
  status: string;
  recipientCount: number | null;
  sentAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/* ---------- Templates ---------- */

interface EmailTemplate {
  id: string;
  label: string;
  subject: string;
  content: string;
}

const TEMPLATES: EmailTemplate[] = [
  {
    id: "feature",
    label: "Feature Announcement",
    subject: "Introducing: [Feature Name]",
    content: [
      "<h2>We're excited to announce [Feature Name]</h2>",
      "<p>We've been working hard on something we think you'll love.</p>",
      "<h3>What's New</h3>",
      "<p>[Describe the new feature and its key benefits.]</p>",
      "<h3>How to Get Started</h3>",
      "<p>[Step-by-step instructions or a link to documentation.]</p>",
      "<h3>What's Next</h3>",
      "<p>[Briefly mention upcoming improvements or related features.]</p>",
      "<p>As always, we'd love to hear your feedback.</p>",
      "<p>Best,<br>The Vestigio Team</p>",
    ].join("\n"),
  },
  {
    id: "changelog",
    label: "Changelog Update",
    subject: "Vestigio Changelog -- v[X.Y.Z]",
    content: [
      "<h2>Changelog -- v[X.Y.Z]</h2>",
      "<p><i>Released [Month Day, Year]</i></p>",
      "<h3>New Features</h3>",
      "<p><b>[Feature 1]</b> -- [Brief description.]</p>",
      "<p><b>[Feature 2]</b> -- [Brief description.]</p>",
      "<h3>Improvements</h3>",
      "<p><b>[Improvement 1]</b> -- [What changed and how it helps.]</p>",
      "<h3>Bug Fixes</h3>",
      "<p>[Fixed an issue where...]</p>",
      "<p>View the full changelog at vestigio.io/changelog.</p>",
      "<p>Best,<br>The Vestigio Team</p>",
    ].join("\n"),
  },
  {
    id: "welcome",
    label: "Welcome Email",
    subject: "Welcome to Vestigio!",
    content: [
      "<h2>Welcome to Vestigio!</h2>",
      "<p>Thanks for joining us. We're thrilled to have you on board.</p>",
      "<h3>Getting Started</h3>",
      "<p>Here are a few things you can do right away:</p>",
      "<p><b>1. Set up your first environment</b></p>",
      "<p><b>2. Invite your team</b></p>",
      "<p><b>3. Explore the dashboard</b></p>",
      "<h3>Need Help?</h3>",
      "<p>Check out our documentation or reply to this email.</p>",
      "<p>Welcome aboard,<br>The Vestigio Team</p>",
    ].join("\n"),
  },
  {
    id: "custom",
    label: "Custom",
    subject: "",
    content: "",
  },
];

/* ---------- DOM helper for safe admin-authored HTML rendering ---------- */

function setElementMarkup(el: HTMLElement, markup: string) {
  // Admin-only content: parse and insert via DOM range for safe rendering
  const range = document.createRange();
  range.selectNodeContents(el);
  range.deleteContents();
  const fragment = range.createContextualFragment(markup);
  el.appendChild(fragment);
}

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

const AUDIENCE_LABELS: Record<string, string> = {
  all: "All Users",
  free: "Free",
  pro: "Pro",
  max: "Max",
};

/* ---------- Safe HTML Content Renderer ---------- */

function SafeHtmlContent({ html, className }: { html: string; className?: string }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef.current) {
      setElementMarkup(containerRef.current, html);
    }
  }, [html]);

  return <div ref={containerRef} className={className} />;
}

/* ---------- Rich Text Editor ---------- */

function RichTextEditor({
  initialContent,
  onChange,
}: {
  initialContent: string;
  onChange: (html: string) => void;
}) {
  const editorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (editorRef.current) {
      setElementMarkup(editorRef.current, initialContent);
    }
  }, [initialContent]);

  const execCommand = (cmd: string, value?: string) => {
    document.execCommand(cmd, false, value);
    editorRef.current?.focus();
    handleInput();
  };

  const handleInput = () => {
    if (editorRef.current) {
      onChange(editorRef.current.innerHTML);
    }
  };

  const handleInsertLink = () => {
    const url = prompt("Enter URL:");
    if (url) {
      execCommand("createLink", url);
    }
  };

  const handleHeading = () => {
    execCommand("formatBlock", "h3");
  };

  return (
    <div className="overflow-hidden rounded-lg border border-edge">
      {/* Toolbar */}
      <div className="flex items-center gap-0.5 border-b border-edge bg-surface-inset px-2 py-1.5">
        <button
          type="button"
          onClick={() => execCommand("bold")}
          className="rounded p-1.5 text-content-muted transition-colors hover:bg-surface-card hover:text-content"
          title="Bold"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor"><path d="M8 6v4h5.5a2 2 0 100-4H8zm0 6v4h6.5a2 2 0 100-4H8z" /></svg>
        </button>
        <button
          type="button"
          onClick={() => execCommand("italic")}
          className="rounded p-1.5 text-content-muted transition-colors hover:bg-surface-card hover:text-content"
          title="Italic"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><line x1="19" y1="4" x2="10" y2="4" /><line x1="14" y1="20" x2="5" y2="20" /><line x1="15" y1="4" x2="9" y2="20" /></svg>
        </button>
        <button
          type="button"
          onClick={handleInsertLink}
          className="rounded p-1.5 text-content-muted transition-colors hover:bg-surface-card hover:text-content"
          title="Insert Link"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" /></svg>
        </button>
        <div className="mx-1 h-4 w-px bg-edge" />
        <button
          type="button"
          onClick={handleHeading}
          className="rounded p-1.5 text-content-muted transition-colors hover:bg-surface-card hover:text-content"
          title="Heading"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M6 4v16M18 4v16M6 12h12" /></svg>
        </button>
      </div>

      {/* Editor area */}
      <div
        ref={editorRef}
        contentEditable
        onInput={handleInput}
        className="min-h-[200px] bg-surface-inset px-4 py-3 text-sm text-content outline-none [&_a]:text-accent-text [&_a]:underline [&_h2]:mb-2 [&_h2]:mt-4 [&_h2]:text-lg [&_h2]:font-bold [&_h2]:text-content [&_h3]:mb-1.5 [&_h3]:mt-3 [&_h3]:text-base [&_h3]:font-semibold [&_h3]:text-content [&_p]:mb-2 [&_p]:leading-relaxed"
        suppressContentEditableWarning
      />
    </div>
  );
}

/* ---------- Skeletons ---------- */

function SkeletonRow() {
  return (
    <tr>
      <td className="px-5 py-3">
        <div className="h-4 w-40 animate-pulse rounded bg-white/[0.06]" />
      </td>
      <td className="px-5 py-3">
        <div className="h-4 w-16 animate-pulse rounded bg-white/[0.06]" />
      </td>
      <td className="px-5 py-3">
        <div className="h-5 w-14 animate-pulse rounded bg-white/[0.06]" />
      </td>
      <td className="px-5 py-3">
        <div className="h-4 w-10 animate-pulse rounded bg-white/[0.06]" />
      </td>
      <td className="px-5 py-3">
        <div className="h-4 w-24 animate-pulse rounded bg-white/[0.06]" />
      </td>
      <td className="px-5 py-3">
        <div className="h-4 w-16 animate-pulse rounded bg-white/[0.06]" />
      </td>
    </tr>
  );
}

/* ---------- Status Badge ---------- */

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    draft: "bg-surface-inset text-content-muted",
    sending: "bg-blue-500/10 text-blue-400 animate-pulse",
    sent: "bg-emerald-500/10 text-emerald-400",
    failed: "bg-red-500/10 text-red-400",
  };

  return (
    <span
      className={`inline-block rounded px-2 py-0.5 text-[11px] font-medium ${styles[status] || styles.draft}`}
    >
      {status}
    </span>
  );
}

/* ---------- Icons ---------- */

const icons = {
  envelope: (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
    </svg>
  ),
  send: (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
    </svg>
  ),
  plus: (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
    </svg>
  ),
  eye: (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  ),
  chevronLeft: (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
    </svg>
  ),
  chevronRight: (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
    </svg>
  ),
  x: (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  ),
};

/* ---------- Main Page ---------- */

export default function AdminNewslettersPage() {
  const [loading, setLoading] = useState(true);
  const [newsletters, setNewsletters] = useState<Newsletter[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  // Compose state
  const [showCompose, setShowCompose] = useState(false);
  const [subject, setSubject] = useState("");
  const [content, setContent] = useState("");
  const [audience, setAudience] = useState("all");
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [composeError, setComposeError] = useState("");

  // Template & editor mode
  const [selectedTemplate, setSelectedTemplate] = useState("custom");
  const [editorMode, setEditorMode] = useState<"edit" | "preview">("edit");
  const [editorKey, setEditorKey] = useState(0);

  // Detail panel
  const [selectedNewsletter, setSelectedNewsletter] = useState<Newsletter | null>(null);

  // Sending a draft from the list
  const [sendingId, setSendingId] = useState<string | null>(null);

  const fetchNewsletters = useCallback(async (p: number) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/newsletters?page=${p}&limit=20`);
      if (res.ok) {
        const data = await res.json();
        setNewsletters(data.newsletters || []);
        setTotal(data.total || 0);
        setPage(data.page || 1);
        setTotalPages(data.totalPages || 1);
      }
    } catch {
      // silently fail — table will show empty state
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNewsletters(1);
  }, [fetchNewsletters]);

  /* ---------- Template handling ---------- */

  function applyTemplate(templateId: string) {
    setSelectedTemplate(templateId);
    const tpl = TEMPLATES.find((t) => t.id === templateId);
    if (tpl) {
      setSubject(tpl.subject);
      setContent(tpl.content);
      setEditorKey((k) => k + 1);
      setEditorMode("edit");
    }
  }

  /* ---------- Actions ---------- */

  async function handleSaveDraft() {
    setComposeError("");
    if (!subject.trim() || !content.trim()) {
      setComposeError("Subject and content are required.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/admin/newsletters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, content, audience, sendNow: false }),
      });
      if (!res.ok) {
        const data = await res.json();
        setComposeError(data.message || "Failed to save draft.");
        return;
      }
      // Reset form and refresh list
      setSubject("");
      setContent("");
      setAudience("all");
      setSelectedTemplate("custom");
      setEditorKey((k) => k + 1);
      setShowCompose(false);
      fetchNewsletters(1);
    } catch {
      setComposeError("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function handleSendNow() {
    setComposeError("");
    if (!subject.trim() || !content.trim()) {
      setComposeError("Subject and content are required.");
      return;
    }
    setSending(true);
    try {
      const res = await fetch("/api/admin/newsletters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, content, audience, sendNow: true }),
      });
      if (!res.ok) {
        const data = await res.json();
        setComposeError(data.message || "Failed to send newsletter.");
        return;
      }
      setSubject("");
      setContent("");
      setAudience("all");
      setSelectedTemplate("custom");
      setEditorKey((k) => k + 1);
      setShowCompose(false);
      fetchNewsletters(1);
    } catch {
      setComposeError("Network error. Please try again.");
    } finally {
      setSending(false);
    }
  }

  async function handleSendDraft(id: string) {
    setSendingId(id);
    try {
      const res = await fetch(`/api/admin/newsletters/${id}/send`, {
        method: "POST",
      });
      if (res.ok) {
        fetchNewsletters(page);
      }
    } catch {
      // silently fail
    } finally {
      setSendingId(null);
    }
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold text-content">Newsletters</h1>
          <p className="mt-1 text-sm text-content-muted">
            Compose and send newsletters to platform users.
          </p>
        </div>
        <button
          onClick={() => {
            const opening = !showCompose;
            setShowCompose(opening);
            setSelectedNewsletter(null);
            setComposeError("");
            if (opening) {
              setSelectedTemplate("custom");
              setSubject("");
              setContent("");
              setEditorKey((k) => k + 1);
              setEditorMode("edit");
            }
          }}
          className="flex items-center gap-2 rounded-lg bg-accent-subtle-bg/20 px-4 py-2 text-sm font-medium text-accent-text transition-colors hover:bg-accent-subtle-bg/30"
        >
          {showCompose ? icons.x : icons.plus}
          <span>{showCompose ? "Cancel" : "Compose"}</span>
        </button>
      </div>

      {/* Compose Section */}
      {showCompose && (
        <div className="rounded-lg border border-edge bg-surface-card">
          <div className="border-b border-edge px-5 py-4">
            <h2 className="text-sm font-semibold text-content">
              New Newsletter
            </h2>
          </div>
          <div className="space-y-4 p-5">
            {/* Template selector */}
            <div>
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-content-muted">
                Template
              </label>
              <select
                value={selectedTemplate}
                onChange={(e) => applyTemplate(e.target.value)}
                className="w-full rounded-lg border border-edge bg-surface-inset px-4 py-2.5 text-sm text-content outline-none transition-colors focus:border-accent/40 focus:ring-1 focus:ring-accent/20"
              >
                {TEMPLATES.map((tpl) => (
                  <option key={tpl.id} value={tpl.id}>
                    {tpl.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Subject */}
            <div>
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-content-muted">
                Subject
              </label>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Newsletter subject line..."
                className="w-full rounded-lg border border-edge bg-surface-inset px-4 py-2.5 text-sm text-content placeholder-content-faint outline-none transition-colors focus:border-accent/40 focus:ring-1 focus:ring-accent/20"
              />
            </div>

            {/* Audience */}
            <div>
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-content-muted">
                Audience
              </label>
              <select
                value={audience}
                onChange={(e) => setAudience(e.target.value)}
                className="w-full rounded-lg border border-edge bg-surface-inset px-4 py-2.5 text-sm text-content outline-none transition-colors focus:border-accent/40 focus:ring-1 focus:ring-accent/20"
              >
                <option value="all">All Users</option>
                <option value="free">Free Plan</option>
                <option value="pro">Pro Plan</option>
                <option value="max">Max Plan</option>
              </select>
            </div>

            {/* Content with Edit/Preview toggle */}
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label className="text-xs font-medium uppercase tracking-wider text-content-muted">
                  Content
                </label>
                <div className="flex rounded-md border border-edge bg-surface-inset p-0.5">
                  <button
                    type="button"
                    onClick={() => setEditorMode("edit")}
                    className={`rounded px-2.5 py-1 text-[11px] font-medium transition-colors ${
                      editorMode === "edit"
                        ? "bg-accent-subtle-bg/20 text-accent-text"
                        : "text-content-muted hover:text-content"
                    }`}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditorMode("preview")}
                    className={`rounded px-2.5 py-1 text-[11px] font-medium transition-colors ${
                      editorMode === "preview"
                        ? "bg-accent-subtle-bg/20 text-accent-text"
                        : "text-content-muted hover:text-content"
                    }`}
                  >
                    Preview
                  </button>
                </div>
              </div>

              {editorMode === "edit" ? (
                <RichTextEditor
                  key={editorKey}
                  initialContent={content}
                  onChange={setContent}
                />
              ) : (
                <div className="min-h-[200px] rounded-lg border border-edge bg-surface-inset px-4 py-3">
                  <SafeHtmlContent
                    html={content}
                    className="text-sm text-content [&_a]:text-accent-text [&_a]:underline [&_h2]:mb-2 [&_h2]:mt-4 [&_h2]:text-lg [&_h2]:font-bold [&_h2]:text-content [&_h3]:mb-1.5 [&_h3]:mt-3 [&_h3]:text-base [&_h3]:font-semibold [&_h3]:text-content [&_p]:mb-2 [&_p]:leading-relaxed"
                  />
                </div>
              )}
            </div>

            {/* Error */}
            {composeError && (
              <div className="rounded-lg border border-red-500/30 bg-red-500/5 px-4 py-2.5 text-sm text-red-400">
                {composeError}
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 pt-1">
              <button
                onClick={handleSaveDraft}
                disabled={saving || sending}
                className="rounded-lg border border-edge px-4 py-2 text-sm font-medium text-content-muted transition-colors hover:bg-surface-inset hover:text-content disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save Draft"}
              </button>
              <button
                onClick={handleSendNow}
                disabled={saving || sending}
                className="flex items-center gap-2 rounded-lg bg-accent-subtle-bg/20 px-4 py-2 text-sm font-medium text-accent-text transition-colors hover:bg-accent-subtle-bg/30 disabled:opacity-50"
              >
                {icons.send}
                <span>{sending ? "Sending..." : "Send Now"}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Detail Panel */}
      {selectedNewsletter && (
        <div className="rounded-lg border border-edge bg-surface-card">
          <div className="flex items-center justify-between border-b border-edge px-5 py-4">
            <div className="flex items-center gap-3">
              <h2 className="text-sm font-semibold text-content">
                {selectedNewsletter.subject}
              </h2>
              <StatusBadge status={selectedNewsletter.status} />
            </div>
            <button
              onClick={() => setSelectedNewsletter(null)}
              className="text-content-faint transition-colors hover:text-content"
            >
              {icons.x}
            </button>
          </div>
          <div className="space-y-3 p-5">
            <div className="flex flex-wrap gap-4 text-xs text-content-faint">
              <span>Audience: {AUDIENCE_LABELS[selectedNewsletter.audience] || selectedNewsletter.audience}</span>
              {selectedNewsletter.recipientCount != null && (
                <span>Recipients: {selectedNewsletter.recipientCount}</span>
              )}
              {selectedNewsletter.sentAt && (
                <span>Sent: {formatDate(selectedNewsletter.sentAt)}</span>
              )}
              <span>Created: {formatDate(selectedNewsletter.createdAt)}</span>
            </div>
            <div className="rounded-lg border border-edge bg-surface-inset p-4">
              <SafeHtmlContent
                html={selectedNewsletter.content}
                className="text-sm text-content [&_a]:text-accent-text [&_a]:underline [&_h2]:mb-2 [&_h2]:mt-4 [&_h2]:text-lg [&_h2]:font-bold [&_h2]:text-content [&_h3]:mb-1.5 [&_h3]:mt-3 [&_h3]:text-base [&_h3]:font-semibold [&_h3]:text-content [&_p]:mb-2 [&_p]:leading-relaxed"
              />
            </div>
          </div>
        </div>
      )}

      {/* Newsletter List */}
      <div className="rounded-lg border border-edge bg-surface-card">
        <div className="flex items-center justify-between border-b border-edge px-5 py-4">
          <h2 className="text-sm font-semibold text-content">
            All Newsletters
          </h2>
          {!loading && (
            <span className="text-xs text-content-faint">
              {total} total
            </span>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-edge">
                <th className="px-5 py-3 text-xs font-medium uppercase tracking-wider text-content-muted">
                  Subject
                </th>
                <th className="px-5 py-3 text-xs font-medium uppercase tracking-wider text-content-muted">
                  Audience
                </th>
                <th className="px-5 py-3 text-xs font-medium uppercase tracking-wider text-content-muted">
                  Status
                </th>
                <th className="px-5 py-3 text-xs font-medium uppercase tracking-wider text-content-muted">
                  Recipients
                </th>
                <th className="px-5 py-3 text-xs font-medium uppercase tracking-wider text-content-muted">
                  Sent
                </th>
                <th className="px-5 py-3 text-xs font-medium uppercase tracking-wider text-content-muted">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-edge">
              {loading ? (
                <>
                  {Array.from({ length: 5 }).map((_, i) => (
                    <SkeletonRow key={i} />
                  ))}
                </>
              ) : newsletters.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center text-sm text-content-faint">
                    No newsletters yet. Click "Compose" to create your first one.
                  </td>
                </tr>
              ) : (
                newsletters.map((nl) => (
                  <tr key={nl.id} className="hover:bg-surface-card-hover">
                    <td className="px-5 py-3">
                      <p className="max-w-[280px] truncate text-sm font-medium text-content">
                        {nl.subject}
                      </p>
                    </td>
                    <td className="px-5 py-3">
                      <span className="text-xs text-content-muted">
                        {AUDIENCE_LABELS[nl.audience] || nl.audience}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <StatusBadge status={nl.status} />
                    </td>
                    <td className="px-5 py-3 tabular-nums text-xs text-content-muted">
                      {nl.recipientCount != null ? nl.recipientCount : "--"}
                    </td>
                    <td className="px-5 py-3 text-xs text-content-faint">
                      {nl.sentAt ? timeAgo(nl.sentAt) : "--"}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            setSelectedNewsletter(nl);
                            setShowCompose(false);
                          }}
                          className="flex items-center gap-1 rounded px-2 py-1 text-xs text-content-muted transition-colors hover:bg-surface-inset hover:text-content"
                          title="View"
                        >
                          {icons.eye}
                        </button>
                        {nl.status === "draft" && (
                          <button
                            onClick={() => handleSendDraft(nl.id)}
                            disabled={sendingId === nl.id}
                            className="flex items-center gap-1 rounded px-2 py-1 text-xs text-accent-text transition-colors hover:bg-accent-subtle-bg/10 disabled:opacity-50"
                            title="Send"
                          >
                            {icons.send}
                            <span>{sendingId === nl.id ? "..." : "Send"}</span>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {!loading && totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-edge px-5 py-3">
            <span className="text-xs text-content-faint">
              Page {page} of {totalPages}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => fetchNewsletters(page - 1)}
                disabled={page <= 1}
                className="flex items-center gap-1 rounded px-2.5 py-1.5 text-xs text-content-muted transition-colors hover:bg-surface-inset hover:text-content disabled:opacity-30"
              >
                {icons.chevronLeft}
                <span>Prev</span>
              </button>
              <button
                onClick={() => fetchNewsletters(page + 1)}
                disabled={page >= totalPages}
                className="flex items-center gap-1 rounded px-2.5 py-1.5 text-xs text-content-muted transition-colors hover:bg-surface-inset hover:text-content disabled:opacity-30"
              >
                <span>Next</span>
                {icons.chevronRight}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
