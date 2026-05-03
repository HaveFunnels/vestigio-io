"use client";

/**
 * SourceCitation — Inline clickable reference to findings, actions, maps.
 * Renders as a subtle pill in the text. Clicking navigates to the source.
 * Used to resolve $$FINDING{id}$$, $$ACTION{id}$$ markers with real data.
 */

interface SourceCitationProps {
  type: "finding" | "action" | "map" | "workspace";
  id: string;
  label: string;
  confidence?: number;
  onNavigate?: (href: string) => void;
}

const TYPE_STYLES: Record<string, { bg: string; text: string; border: string; href: (id: string) => string }> = {
  finding: {
    bg: "bg-red-500/5",
    text: "text-red-400",
    border: "border-red-800/20",
    href: (id) => `/app/findings?finding=${id}`,
  },
  action: {
    bg: "bg-emerald-500/5",
    text: "text-emerald-400",
    border: "border-emerald-800/20",
    href: (id) => `/app/actions?action=${id}`,
  },
  map: {
    bg: "bg-blue-500/5",
    text: "text-blue-400",
    border: "border-blue-800/20",
    href: (id) => `/app/maps?type=${id}`,
  },
  workspace: {
    bg: "bg-purple-500/5",
    text: "text-purple-400",
    border: "border-purple-800/20",
    href: (id) => `/app/workspaces?id=${id}`,
  },
};

export function SourceCitation({ type, id, label, confidence, onNavigate }: SourceCitationProps) {
  const style = TYPE_STYLES[type] || TYPE_STYLES.finding;

  return (
    <button
      onClick={() => onNavigate?.(style.href(id))}
      className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] font-medium transition-colors hover:brightness-125 ${style.bg} ${style.text} ${style.border}`}
    >
      <span className="opacity-60">{type === "finding" ? "F" : type === "action" ? "A" : type === "map" ? "M" : "W"}</span>
      <span className="max-w-[200px] truncate">{label}</span>
      {confidence != null && (
        <span className="opacity-50">{confidence}%</span>
      )}
    </button>
  );
}
