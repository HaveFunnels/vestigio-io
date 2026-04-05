"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { PortableText } from "@portabletext/react";

// ──────────────────────────────────────────────
// Knowledge Base Article Detail
// ──────────────────────────────────────────────

interface KBArticle {
  _id: string;
  title: string;
  slug: { current: string };
  category: string;
  finding_key?: string;
  root_cause_key?: string;
  excerpt?: string;
  body: any[];
  publishedAt?: string;
}

const categoryLabels: Record<string, string> = {
  concept: "Concept",
  pack: "Pack",
  finding: "Finding",
  guide: "Guide",
};

const categoryColors: Record<string, string> = {
  concept: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
  pack: "bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20",
  finding: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
  guide: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
};

// Portable text components for rendering Sanity block content
const portableTextComponents = {
  block: {
    h1: ({ children }: any) => <h1 className="mb-4 mt-8 text-2xl font-bold text-content">{children}</h1>,
    h2: ({ children }: any) => <h2 className="mb-3 mt-6 text-xl font-semibold text-content">{children}</h2>,
    h3: ({ children }: any) => <h3 className="mb-2 mt-5 text-lg font-semibold text-content-secondary">{children}</h3>,
    h4: ({ children }: any) => <h4 className="mb-2 mt-4 text-base font-medium text-content-secondary">{children}</h4>,
    normal: ({ children }: any) => <p className="mb-4 text-sm leading-relaxed text-content-secondary">{children}</p>,
    blockquote: ({ children }: any) => (
      <blockquote className="my-4 border-l-2 border-accent/50 pl-4 text-sm italic text-content-muted">
        {children}
      </blockquote>
    ),
  },
  list: {
    bullet: ({ children }: any) => <ul className="mb-4 list-disc pl-6 text-sm text-content-secondary space-y-1">{children}</ul>,
  },
  marks: {
    strong: ({ children }: any) => <strong className="font-semibold text-content">{children}</strong>,
    em: ({ children }: any) => <em>{children}</em>,
    link: ({ value, children }: any) => (
      <a
        href={value?.href}
        target={value?.blank ? "_blank" : undefined}
        rel={value?.blank ? "noopener noreferrer" : undefined}
        className="text-accent underline decoration-accent/30 hover:decoration-accent"
      >
        {children}
      </a>
    ),
  },
};

export default function KnowledgeArticlePage() {
  const params = useParams();
  const router = useRouter();
  const t = useTranslations("console.knowledge_base");
  const slug = params.slug as string;

  const [article, setArticle] = useState<KBArticle | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    fetch(`/api/knowledge-base/${slug}`)
      .then((r) => {
        if (!r.ok) { setNotFound(true); return null; }
        return r.json();
      })
      .then((data) => { if (data) setArticle(data.article || null); })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [slug]);

  if (loading) {
    return (
      <div className="p-6">
        <div className="mx-auto max-w-3xl space-y-4">
          <div className="h-6 w-48 animate-pulse rounded bg-surface-inset" />
          <div className="h-8 w-3/4 animate-pulse rounded bg-surface-inset" />
          <div className="space-y-3 pt-4">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-4 w-full animate-pulse rounded bg-surface-inset" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (notFound || !article) {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <svg className="h-12 w-12 text-content-faint" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m5.231 13.481L15 17.25m-4.5-15H5.625c-.621 0-1.125.504-1.125 1.125v16.5c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9zm3.75 11.625a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
        </svg>
        <p className="mt-4 text-sm text-content-muted">{t("article_not_found")}</p>
        <button
          onClick={() => router.push("/app/knowledge-base")}
          className="mt-4 rounded-md border border-edge px-4 py-2 text-sm text-content-secondary transition-colors hover:bg-surface-card-hover"
        >
          {t("back")}
        </button>
      </div>
    );
  }

  const catColor = categoryColors[article.category] || "border-edge text-content-muted";

  return (
    <div className="p-6">
      <div className="mx-auto max-w-3xl">
        {/* Back link + category badge */}
        <div className="mb-6 flex items-center gap-3">
          <button
            onClick={() => router.push("/app/knowledge-base")}
            className="flex items-center gap-1 text-xs text-content-muted transition-colors hover:text-content-secondary"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
            {t("back")}
          </button>
          <span className={`rounded border px-2 py-0.5 text-[10px] font-semibold ${catColor}`}>
            {categoryLabels[article.category] || article.category}
          </span>
          {article.finding_key && (
            <code className="rounded border border-edge px-2 py-0.5 text-[10px] text-content-faint">
              {article.finding_key}
            </code>
          )}
        </div>

        {/* Title */}
        <h1 className="text-2xl font-bold text-content">{article.title}</h1>
        {article.excerpt && (
          <p className="mt-2 text-sm leading-relaxed text-content-muted">{article.excerpt}</p>
        )}

        {/* Body */}
        <div className="mt-8 border-t border-edge pt-8">
          {article.body ? (
            <PortableText value={article.body} components={portableTextComponents} />
          ) : (
            <p className="text-sm text-content-faint italic">{t("no_content")}</p>
          )}
        </div>
      </div>
    </div>
  );
}
