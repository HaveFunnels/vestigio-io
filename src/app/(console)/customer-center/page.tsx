"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";

// ──────────────────────────────────────────────
// Customer Center — Hub with 3 cards
// Knowledge Base, Support, Feedback
// ──────────────────────────────────────────────

const CARDS = [
  {
    id: "knowledge_base",
    href: "/app/knowledge-base",
    icon: "M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25",
    color: "text-emerald-500",
    border: "hover:border-emerald-500/30",
    bg: "bg-emerald-500/10",
  },
  {
    id: "support",
    href: "/app/customer-center/support",
    icon: "M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z",
    color: "text-blue-500",
    border: "hover:border-blue-500/30",
    bg: "bg-blue-500/10",
  },
  {
    id: "feedback",
    href: "/app/customer-center/feedback",
    icon: "M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z",
    color: "text-amber-500",
    border: "hover:border-amber-500/30",
    bg: "bg-amber-500/10",
  },
];

export default function CustomerCenterPage() {
  const t = useTranslations("console.customer_center");

  return (
    <div className="flex min-h-full items-start justify-center p-6 pt-16">
      <div className="w-full max-w-3xl">
        {/* Header */}
        <div className="mb-2 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-edge bg-surface-card">
            <svg className="h-6 w-6 text-content-faint" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-content">{t("title")}</h1>
          <p className="mt-2 text-sm text-content-muted">{t("subtitle")}</p>
        </div>

        {/* Cards */}
        <div className="mt-10 grid gap-4 sm:grid-cols-3">
          {CARDS.map((card) => (
            <Link
              key={card.id}
              href={card.href}
              className={`group flex flex-col items-center rounded-xl border border-edge bg-surface-card p-6 text-center transition-all hover:shadow-lg ${card.border}`}
            >
              <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${card.bg}`}>
                <svg className={`h-6 w-6 ${card.color}`} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d={card.icon} />
                </svg>
              </div>
              <h2 className="mt-4 text-sm font-semibold text-content-secondary group-hover:text-content">
                {t(`cards.${card.id}.title`)}
              </h2>
              <p className="mt-1.5 text-xs leading-relaxed text-content-muted">
                {t(`cards.${card.id}.description`)}
              </p>
              <div className="mt-4 flex items-center gap-1 text-[11px] font-medium text-content-faint transition-colors group-hover:text-content-muted">
                {t(`cards.${card.id}.cta`)}
                <svg className="h-3 w-3 transition-transform group-hover:translate-x-0.5" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                </svg>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
