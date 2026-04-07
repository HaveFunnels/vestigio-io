"use client";

/**
 * KbArticleCard — Inline knowledge base reference in chat messages.
 * Emitted by the LLM via $$KB{finding:<key>}$$ or $$KB{root_cause:<key>}$$
 * markers and resolved server-side.
 *
 * Two visual states:
 * - Resolved: shows article title + excerpt, links to /app/knowledge-base/<slug>
 * - Unresolved (no Sanity article yet): shows a "Browse related docs" fallback
 *   linking to the catalog page filtered by key, so the link is never dead.
 */

import type { KbArticleCardBlock } from "@/lib/chat-types";

interface KbArticleCardProps {
  block: KbArticleCardBlock;
  onNavigate?: (href: string) => void;
}

export function KbArticleCard({ block, onNavigate }: KbArticleCardProps) {
  const href = block.slug
    ? `/app/knowledge-base/${block.slug}`
    : `/app/knowledge-base?${block.key_kind}=${encodeURIComponent(block.key)}`;

  const title = block.title || (block.key_kind === "root_cause" ? "Browse related docs" : "Browse related docs");
  const subtitle = block.excerpt || "Open the knowledge base to learn more about this topic.";

  return (
    <button
      type="button"
      onClick={() => onNavigate?.(href)}
      className="group my-2 flex w-full items-start gap-3 rounded-lg border border-edge bg-surface-card/60 px-3.5 py-3 text-left transition-colors hover:border-accent/40 hover:bg-surface-inset/60"
    >
      {/* Book icon */}
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-edge bg-surface-inset text-content-faint group-hover:text-accent">
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
        </svg>
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-content-faint">
          Learn more
        </div>
        <div className="mt-0.5 truncate text-sm font-medium text-content-secondary group-hover:text-content">
          {title}
        </div>
        <div className="mt-0.5 text-xs text-content-muted line-clamp-2">
          {subtitle}
        </div>
      </div>

      {/* Arrow */}
      <svg className="mt-1 h-3.5 w-3.5 shrink-0 text-content-faint group-hover:text-accent" viewBox="0 0 16 16" fill="none">
        <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}
