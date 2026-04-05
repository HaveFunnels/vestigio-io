"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import PageHeader from "@/components/console/PageHeader";

// ──────────────────────────────────────────────
// Knowledge Base — Sanity-powered documentation
//
// Categories: Concepts, Packs, Findings, Guides
// Articles fetched from Sanity CMS via API route
// ──────────────────────────────────────────────

interface KBArticle {
  _id: string;
  title: string;
  slug: { current: string };
  category: string;
  finding_key?: string;
  root_cause_key?: string;
  excerpt?: string;
  publishedAt?: string;
}

type CategoryFilter = "all" | "concept" | "pack" | "finding" | "guide";

const categoryConfig: Record<string, { label: string; color: string; icon: string }> = {
  concept: {
    label: "Concept",
    color: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
    icon: "M4.26 10.147a60.436 60.436 0 00-.491 6.347A48.627 48.627 0 0112 20.904a48.627 48.627 0 018.232-4.41 60.46 60.46 0 00-.491-6.347m-15.482 0a50.57 50.57 0 00-2.658-.813A59.905 59.905 0 0112 3.493a59.902 59.902 0 0110.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.697 50.697 0 0112 13.489a50.702 50.702 0 017.74-3.342M6.75 15a.75.75 0 100-1.5.75.75 0 000 1.5zm0 0v-3.675A55.378 55.378 0 0112 8.443m-7.007 11.55A5.981 5.981 0 006.75 15.75v-1.5",
  },
  pack: {
    label: "Pack",
    color: "bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20",
    icon: "M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z",
  },
  finding: {
    label: "Finding",
    color: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
    icon: "M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m5.231 13.481L15 17.25m-4.5-15H5.625c-.621 0-1.125.504-1.125 1.125v16.5c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9zm3.75 11.625a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z",
  },
  guide: {
    label: "Guide",
    color: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
    icon: "M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25",
  },
};

export default function KnowledgeBasePage() {
  const t = useTranslations("console.knowledge_base");
  const tc = useTranslations("console.common");
  const [articles, setArticles] = useState<KBArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("all");
  const [searchText, setSearchText] = useState("");

  useEffect(() => {
    fetch("/api/knowledge-base")
      .then((r) => r.json())
      .then((data) => setArticles(data.articles || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    return articles.filter((a) => {
      if (categoryFilter !== "all" && a.category !== categoryFilter) return false;
      if (searchText) {
        const q = searchText.toLowerCase();
        if (
          !a.title.toLowerCase().includes(q) &&
          !(a.excerpt || "").toLowerCase().includes(q) &&
          !(a.finding_key || "").toLowerCase().includes(q)
        )
          return false;
      }
      return true;
    });
  }, [articles, categoryFilter, searchText]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { concept: 0, pack: 0, finding: 0, guide: 0 };
    for (const a of articles) {
      if (a.category in c) c[a.category]++;
    }
    return c;
  }, [articles]);

  const tabs: { key: CategoryFilter; label: string; count?: number }[] = [
    { key: "all", label: t("tabs.all") },
    { key: "concept", label: t("tabs.concepts"), count: counts.concept },
    { key: "pack", label: t("tabs.packs"), count: counts.pack },
    { key: "finding", label: t("tabs.findings"), count: counts.finding },
    { key: "guide", label: t("tabs.guides"), count: counts.guide },
  ];

  return (
    <div className="p-6">
      <PageHeader
        title={t("title")}
        subtitle={t("subtitle")}
        tooltip={tc("page_tooltips.knowledge_base")}
      />

      {/* Tab Bar */}
      <div className="mb-4 flex items-center gap-1 rounded-lg border border-edge bg-surface-card p-1">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setCategoryFilter(tab.key)}
            className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
              categoryFilter === tab.key
                ? "bg-surface-inset text-content font-semibold"
                : "text-content-muted hover:text-content-secondary"
            }`}
          >
            {tab.label}
            {tab.count !== undefined && tab.count > 0 && (
              <span className="rounded-full bg-surface-inset px-1.5 py-0.5 text-[10px] font-semibold text-content-secondary">
                {tab.count}
              </span>
            )}
          </button>
        ))}
        <div className="flex-1" />
        <input
          type="text"
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          placeholder={t("search_placeholder")}
          className="rounded-md border border-edge bg-surface-card px-3 py-1.5 text-xs text-content-secondary placeholder:text-content-faint focus:border-accent/50 focus:outline-none focus:ring-1 focus:ring-accent/30"
        />
      </div>

      {/* Content */}
      {loading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="flex items-center gap-4 rounded-lg border border-edge bg-surface-card/30 p-5">
              <div className="h-10 w-10 animate-pulse rounded-lg bg-surface-inset" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-2/3 animate-pulse rounded bg-surface-inset" />
                <div className="h-3 w-1/2 animate-pulse rounded bg-surface-inset" />
              </div>
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-16 text-center">
          <svg className="mx-auto h-12 w-12 text-content-faint" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
          </svg>
          <p className="mt-4 text-sm text-content-muted">
            {articles.length === 0 ? t("empty") : t("no_results")}
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((article) => {
            const cfg = categoryConfig[article.category];
            return (
              <Link
                key={article._id}
                href={`/app/knowledge-base/${article.slug.current}`}
                className="group flex flex-col rounded-lg border border-edge bg-surface-card p-5 transition-all hover:border-accent/30 hover:shadow-md"
              >
                <div className="flex items-center gap-2.5">
                  {cfg && (
                    <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${cfg.color}`}>
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d={cfg.icon} />
                      </svg>
                    </div>
                  )}
                  <span className={`rounded border px-2 py-0.5 text-[10px] font-semibold ${cfg?.color || "text-content-muted border-edge"}`}>
                    {cfg?.label || article.category}
                  </span>
                </div>
                <h3 className="mt-3 text-sm font-semibold text-content-secondary group-hover:text-content">
                  {article.title}
                </h3>
                {article.excerpt && (
                  <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-content-muted">
                    {article.excerpt}
                  </p>
                )}
                {article.finding_key && (
                  <code className="mt-2 inline-block max-w-fit rounded border border-edge px-2 py-0.5 text-[10px] text-content-faint">
                    {article.finding_key}
                  </code>
                )}
                <div className="mt-auto flex items-center justify-end pt-3">
                  <span className="text-[10px] text-content-faint transition-colors group-hover:text-accent">
                    {t("read_more")} &rarr;
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
