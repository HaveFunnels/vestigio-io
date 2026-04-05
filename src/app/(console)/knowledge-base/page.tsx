"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";

// ──────────────────────────────────────────────
// Knowledge Base — Documentation hub
//
// Docs-style layout: left sidebar with sections,
// main area with article cards grouped by category.
// ──────────────────────────────────────────────

interface KBArticle {
  _id: string;
  title: string;
  slug: { current: string };
  category: string;
  order?: number;
  finding_key?: string;
  root_cause_key?: string;
  excerpt?: string;
  publishedAt?: string;
}

const SECTIONS: { key: string; label: string; icon: string }[] = [
  { key: "get_started", label: "Get Started", icon: "M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" },
  { key: "concept", label: "Core Concepts", icon: "M4.26 10.147a60.436 60.436 0 00-.491 6.347A48.627 48.627 0 0112 20.904a48.627 48.627 0 018.232-4.41 60.46 60.46 0 00-.491-6.347m-15.482 0a50.57 50.57 0 00-2.658-.813A59.905 59.905 0 0112 3.493a59.902 59.902 0 0110.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.697 50.697 0 0112 13.489a50.702 50.702 0 017.74-3.342M6.75 15a.75.75 0 100-1.5.75.75 0 000 1.5zm0 0v-3.675A55.378 55.378 0 0112 8.443m-7.007 11.55A5.981 5.981 0 006.75 15.75v-1.5" },
  { key: "pack", label: "Decision Packs", icon: "M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" },
  { key: "finding", label: "Findings Catalog", icon: "M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m5.231 13.481L15 17.25m-4.5-15H5.625c-.621 0-1.125.504-1.125 1.125v16.5c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9zm3.75 11.625a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" },
  { key: "api", label: "API Reference", icon: "M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" },
  { key: "guide", label: "Guides", icon: "M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" },
];

const sectionColors: Record<string, string> = {
  get_started: "text-emerald-500",
  concept: "text-blue-500",
  pack: "text-violet-500",
  finding: "text-amber-500",
  api: "text-cyan-500",
  guide: "text-rose-500",
};

const cardBorders: Record<string, string> = {
  get_started: "hover:border-emerald-500/30",
  concept: "hover:border-blue-500/30",
  pack: "hover:border-violet-500/30",
  finding: "hover:border-amber-500/30",
  api: "hover:border-cyan-500/30",
  guide: "hover:border-rose-500/30",
};

const badgeStyles: Record<string, string> = {
  get_started: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
  concept: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
  pack: "bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20",
  finding: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
  api: "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/20",
  guide: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20",
};

export default function KnowledgeBasePage() {
  const t = useTranslations("console.knowledge_base");
  const [articles, setArticles] = useState<KBArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const [searchText, setSearchText] = useState("");

  useEffect(() => {
    fetch("/api/knowledge-base")
      .then((r) => r.json())
      .then((data) => {
        const items = data.articles || [];
        setArticles(items);
        // Default to first section that has articles, or "get_started"
        const firstWithContent = SECTIONS.find((s) =>
          items.some((a: KBArticle) => a.category === s.key)
        );
        setActiveSection(firstWithContent?.key || "get_started");
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Search across all articles
  const searchResults = useMemo(() => {
    if (!searchText.trim()) return null;
    const q = searchText.toLowerCase();
    return articles.filter(
      (a) =>
        a.title.toLowerCase().includes(q) ||
        (a.excerpt || "").toLowerCase().includes(q) ||
        (a.finding_key || "").toLowerCase().includes(q)
    );
  }, [articles, searchText]);

  // Articles for the active section
  const sectionArticles = useMemo(() => {
    if (!activeSection) return [];
    return articles.filter((a) => a.category === activeSection);
  }, [articles, activeSection]);

  // Count per section
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const a of articles) {
      c[a.category] = (c[a.category] || 0) + 1;
    }
    return c;
  }, [articles]);

  const activeSectionMeta = SECTIONS.find((s) => s.key === activeSection);

  return (
    <div className="flex h-full">
      {/* ── Left Sidebar ── */}
      <aside className="hidden w-56 shrink-0 flex-col border-r border-edge bg-surface-shell md:flex">
        {/* Header */}
        <div className="border-b border-edge px-4 py-4">
          <h1 className="text-sm font-semibold text-content">{t("title")}</h1>
          <p className="mt-0.5 text-[11px] text-content-faint">{t("subtitle")}</p>
        </div>

        {/* Search */}
        <div className="px-3 py-2.5">
          <div className="relative">
            <svg className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-content-faint" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
            <input
              type="text"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder={t("search_placeholder")}
              className="w-full rounded-md border border-edge bg-surface-card py-1.5 pl-8 pr-3 text-xs text-content-secondary placeholder:text-content-faint focus:border-accent/50 focus:outline-none focus:ring-1 focus:ring-accent/30"
            />
          </div>
        </div>

        {/* Sections nav */}
        <nav className="flex-1 overflow-y-auto px-2 pb-4">
          {SECTIONS.map((section) => {
            const isActive = activeSection === section.key && !searchText;
            const count = counts[section.key] || 0;
            return (
              <button
                key={section.key}
                onClick={() => { setActiveSection(section.key); setSearchText(""); }}
                className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13px] font-medium transition-all ${
                  isActive
                    ? "bg-surface-card text-content font-semibold"
                    : "text-content-muted hover:bg-surface-card/50 hover:text-content-secondary"
                }`}
              >
                <svg className={`h-4 w-4 shrink-0 ${isActive ? sectionColors[section.key] : "text-content-faint"}`} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d={section.icon} />
                </svg>
                <span className="flex-1">{section.label}</span>
                {count > 0 && (
                  <span className="rounded-full bg-surface-inset px-1.5 py-0.5 text-[10px] text-content-faint">
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </aside>

      {/* ── Mobile top nav ── */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="flex items-center gap-2 overflow-x-auto border-b border-edge px-4 py-2 md:hidden">
          {SECTIONS.map((section) => (
            <button
              key={section.key}
              onClick={() => { setActiveSection(section.key); setSearchText(""); }}
              className={`shrink-0 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                activeSection === section.key && !searchText
                  ? "bg-surface-card text-content"
                  : "text-content-muted"
              }`}
            >
              {section.label}
            </button>
          ))}
        </div>

        {/* ── Main content ── */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <LoadingSkeleton />
          ) : searchText && searchResults ? (
            /* Search results */
            <div>
              <h2 className="mb-1 text-lg font-semibold text-content">
                {t("search_results")}
              </h2>
              <p className="mb-6 text-xs text-content-muted">
                {searchResults.length} {searchResults.length === 1 ? "result" : "results"} for &ldquo;{searchText}&rdquo;
              </p>
              {searchResults.length === 0 ? (
                <EmptyState message={t("no_results")} />
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {searchResults.map((article) => (
                    <ArticleCard key={article._id} article={article} />
                  ))}
                </div>
              )}
            </div>
          ) : sectionArticles.length === 0 ? (
            /* Empty section */
            <div>
              <SectionHeader section={activeSectionMeta} />
              <EmptyState message={t("empty")} />
            </div>
          ) : (
            /* Section articles */
            <div>
              <SectionHeader section={activeSectionMeta} />
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {sectionArticles.map((article) => (
                  <ArticleCard key={article._id} article={article} />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Section Header ──

function SectionHeader({ section }: { section?: { key: string; label: string; icon: string } }) {
  if (!section) return null;
  return (
    <div className="mb-6 flex items-center gap-3">
      <div className={`flex h-9 w-9 items-center justify-center rounded-lg border border-edge bg-surface-card ${sectionColors[section.key]}`}>
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d={section.icon} />
        </svg>
      </div>
      <div>
        <h2 className="text-lg font-semibold text-content">{section.label}</h2>
      </div>
    </div>
  );
}

// ── Article Card ──

function ArticleCard({ article }: { article: KBArticle }) {
  const badge = badgeStyles[article.category] || "border-edge text-content-muted";
  const border = cardBorders[article.category] || "hover:border-edge";
  const sectionLabel = SECTIONS.find((s) => s.key === article.category)?.label || article.category;

  return (
    <Link
      href={`/app/knowledge-base/${article.slug.current}`}
      className={`group flex flex-col rounded-lg border border-edge bg-surface-card p-4 transition-all hover:shadow-md ${border}`}
    >
      <div className="flex items-center gap-2">
        <span className={`rounded border px-1.5 py-0.5 text-[9px] font-semibold ${badge}`}>
          {sectionLabel}
        </span>
        {article.finding_key && (
          <code className="rounded border border-edge px-1.5 py-0.5 text-[9px] text-content-faint">
            {article.finding_key}
          </code>
        )}
      </div>
      <h3 className="mt-2.5 text-sm font-semibold text-content-secondary group-hover:text-content">
        {article.title}
      </h3>
      {article.excerpt && (
        <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-content-muted">
          {article.excerpt}
        </p>
      )}
      <div className="mt-auto flex items-center justify-end pt-3">
        <svg className="h-3.5 w-3.5 text-content-faint transition-transform group-hover:translate-x-0.5 group-hover:text-content-muted" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
        </svg>
      </div>
    </Link>
  );
}

// ── Empty State ──

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16">
      <svg className="h-10 w-10 text-content-faint" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
      </svg>
      <p className="mt-3 text-sm text-content-muted">{message}</p>
    </div>
  );
}

// ── Loading Skeleton ──

function LoadingSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="h-9 w-9 animate-pulse rounded-lg bg-surface-inset" />
        <div className="h-5 w-40 animate-pulse rounded bg-surface-inset" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="rounded-lg border border-edge bg-surface-card p-4">
            <div className="h-4 w-16 animate-pulse rounded bg-surface-inset" />
            <div className="mt-3 h-4 w-3/4 animate-pulse rounded bg-surface-inset" />
            <div className="mt-2 h-3 w-full animate-pulse rounded bg-surface-inset" />
            <div className="mt-1 h-3 w-2/3 animate-pulse rounded bg-surface-inset" />
          </div>
        ))}
      </div>
    </div>
  );
}
