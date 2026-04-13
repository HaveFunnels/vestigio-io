"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import toast from "react-hot-toast";

// ──────────────────────────────────────────────
// Feedback — Positive, encouraging feedback form
// Compatible with admin Feedback dashboard
// ──────────────────────────────────────────────

const typeOptions = [
  { value: "general", icon: "M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" },
  { value: "bug", icon: "M12 12.75c1.148 0 2.278.08 3.383.237 1.037.146 1.866.966 1.866 2.013 0 3.728-2.35 6.75-5.25 6.75S6.75 18.728 6.75 15c0-1.046.83-1.867 1.866-2.013A24.204 24.204 0 0112 12.75zm0 0c2.883 0 5.647.508 8.207 1.44a23.91 23.91 0 01-1.152-6.135c-.22-2.046-1.653-3.7-3.583-4.315a15.46 15.46 0 00-6.944 0c-1.93.615-3.364 2.269-3.583 4.315a23.834 23.834 0 01-1.152 6.135A24.108 24.108 0 0112 12.75z" },
  { value: "feature", icon: "M12 18v-5.25m0 0a6.01 6.01 0 001.5-.189m-1.5.189a6.01 6.01 0 01-1.5-.189m3.75 7.478a12.06 12.06 0 01-4.5 0m3.75 2.383a14.406 14.406 0 01-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 10-7.517 0c.85.493 1.509 1.333 1.509 2.316V18" },
  { value: "ux", icon: "M9.53 16.122a3 3 0 00-5.78 1.128 2.25 2.25 0 01-2.4 2.245 4.5 4.5 0 008.4-2.245c0-.399-.078-.78-.22-1.128zm0 0a15.998 15.998 0 003.388-1.62m-5.043-.025a15.994 15.994 0 011.622-3.395m3.42 3.42a15.995 15.995 0 004.764-4.648l3.876-5.814a1.151 1.151 0 00-1.597-1.597L14.146 6.32a15.996 15.996 0 00-4.649 4.763m3.42 3.42a6.776 6.776 0 00-3.42-3.42" },
  { value: "performance", icon: "M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" },
];

export default function FeedbackPage() {
  const t = useTranslations("console.customer_center.feedback");
  const { data: session } = useSession();
  const router = useRouter();

  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [type, setType] = useState("general");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [rating, setRating] = useState<number | null>(null);
  const [hoveredStar, setHoveredStar] = useState<number | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) return;
    setSubmitting(true);

    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          title: title.trim() || null,
          content: content.trim(),
          rating,
          page: window.location.pathname,
          userName: session?.user?.name || null,
          userEmail: session?.user?.email || null,
        }),
      });

      if (res.ok) {
        setSubmitted(true);
      } else {
        toast.error(t("error"));
      }
    } catch {
      toast.error(t("error"));
    } finally {
      setSubmitting(false);
    }
  };

  // Success state
  if (submitted) {
    return (
      <div className="flex min-h-full items-start justify-center p-6 pt-20">
        <div className="w-full max-w-lg text-center">
          {/* Celebration icon */}
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500/10">
            <svg className="h-8 w-8 text-emerald-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
            </svg>
          </div>

          <h1 className="text-2xl font-bold text-content">{t("success.title")}</h1>
          <p className="mt-3 text-sm leading-relaxed text-content-muted">{t("success.message")}</p>
          <p className="mt-2 text-xs text-content-faint">{t("success.follow_up")}</p>

          <div className="mt-8 flex items-center justify-center gap-3">
            <button
              onClick={() => { setSubmitted(false); setTitle(""); setContent(""); setRating(null); setType("general"); }}
              className="rounded-lg border border-edge px-4 py-2 text-sm text-content-secondary transition-colors hover:bg-surface-card-hover"
            >
              {t("success.send_another")}
            </button>
            <button
              onClick={() => router.push("/app/customer-center")}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent/90"
            >
              {t("success.back")}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mx-auto max-w-2xl">
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={() => router.push("/app/customer-center")}
            className="mb-4 flex items-center gap-1 text-xs text-content-muted transition-colors hover:text-content-secondary"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
            {t("back")}
          </button>

          <h1 className="text-xl font-semibold text-content">{t("title")}</h1>
          <p className="mt-1 text-sm text-content-muted">{t("subtitle")}</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Type selector */}
          <div>
            <label className="mb-2 block text-xs font-medium text-content-muted">{t("form.type")}</label>
            <div className="grid grid-cols-5 gap-2">
              {typeOptions.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setType(opt.value)}
                  className={`flex flex-col items-center gap-1.5 rounded-lg border p-3 text-center transition-all ${
                    type === opt.value
                      ? "border-accent/50 bg-accent/5 text-accent"
                      : "border-edge bg-surface-card text-content-muted hover:border-edge hover:bg-surface-card-hover"
                  }`}
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d={opt.icon} />
                  </svg>
                  <span className="text-[10px] font-medium">{t(`types.${opt.value}`)}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Rating */}
          <div>
            <label className="mb-2 block text-xs font-medium text-content-muted">{t("form.rating")}</label>
            <div className="flex items-center gap-1">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() => setRating(star)}
                  onMouseEnter={() => setHoveredStar(star)}
                  onMouseLeave={() => setHoveredStar(null)}
                  className="p-0.5 transition-transform hover:scale-110"
                >
                  <svg
                    className={`h-7 w-7 transition-colors ${
                      star <= (hoveredStar ?? rating ?? 0)
                        ? "fill-amber-400 text-amber-400"
                        : "fill-none text-content-faint"
                    }`}
                    viewBox="0 0 24 24"
                    strokeWidth={1.5}
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
                  </svg>
                </button>
              ))}
              {rating && (
                <span className="ml-2 text-xs text-content-faint">{t(`ratings.${rating}`)}</span>
              )}
            </div>
          </div>

          {/* Title (optional) */}
          <div>
            <label className="mb-1 block text-xs font-medium text-content-muted">
              {t("form.title")} <span className="text-content-faint">({t("form.optional")})</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t("form.title_placeholder")}
              className="w-full rounded-md border border-edge bg-surface-inset px-3 py-2 text-sm text-content-secondary placeholder:text-content-faint focus:border-accent/50 focus:outline-none focus:ring-1 focus:ring-accent/30"
              maxLength={200}
            />
          </div>

          {/* Content */}
          <div>
            <label className="mb-1 block text-xs font-medium text-content-muted">{t("form.content")}</label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder={t("form.content_placeholder")}
              rows={6}
              className="w-full rounded-md border border-edge bg-surface-inset px-3 py-2 text-sm text-content-secondary placeholder:text-content-faint focus:border-accent/50 focus:outline-none focus:ring-1 focus:ring-accent/30 resize-none"
              required
              maxLength={5000}
            />
          </div>

          {/* Submit */}
          <div className="flex items-center justify-between">
            <p className="text-xs text-content-faint">{t("form.privacy_note")}</p>
            <button
              type="submit"
              disabled={submitting || !content.trim()}
              className="rounded-lg bg-accent px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent/90 disabled:opacity-50"
            >
              {submitting ? t("form.submitting") : t("form.submit")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
