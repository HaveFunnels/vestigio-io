"use client";

/**
 * ChatMarkdown — Full markdown renderer for chat messages (v2).
 *
 * Supports: headings, bold, italic, inline code, code blocks, links,
 * unordered/ordered/nested lists, blockquotes, horizontal rules, tables.
 *
 * Security: React elements only — no innerHTML, no raw HTML injection.
 * ReDoS-safe: all regexes are length-bounded.
 */

import React from "react";

interface ChatMarkdownProps {
  content: string;
  className?: string;
}

export function ChatMarkdown({ content, className = "" }: ChatMarkdownProps) {
  const lines = content.split("\n");
  const elements: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // ── Code block (```) ─────────────────────
    if (line.trimStart().startsWith("```")) {
      const lang = line.trimStart().slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trimStart().startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      i++;
      elements.push(
        <div key={elements.length} className="my-2">
          {lang && (
            <div className="rounded-t-md border border-b-0 border-zinc-800 bg-zinc-900 px-3 py-1">
              <span className="font-mono text-[10px] text-zinc-500">{lang}</span>
            </div>
          )}
          <pre className={`overflow-x-auto ${lang ? "rounded-b-md border border-t-0" : "rounded-md border"} border-zinc-800 bg-zinc-950 px-3 py-2 font-mono text-xs leading-relaxed text-zinc-300`}>
            {codeLines.join("\n")}
          </pre>
        </div>,
      );
      continue;
    }

    // ── Horizontal rule (---/***) ─────────────
    if (/^(\s*[-*_]){3,}\s*$/.test(line)) {
      elements.push(<hr key={elements.length} className="my-3 border-zinc-800" />);
      i++;
      continue;
    }

    // ── Empty line ───────────────────────────
    if (!line.trim()) {
      elements.push(<div key={elements.length} className="h-2" />);
      i++;
      continue;
    }

    // ── Table ────────────────────────────────
    if (line.includes("|") && i + 1 < lines.length && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1])) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].includes("|")) {
        tableLines.push(lines[i]);
        i++;
      }
      elements.push(<MarkdownTable key={elements.length} lines={tableLines} />);
      continue;
    }

    // ── Blockquote (>) ───────────────────────
    if (line.trimStart().startsWith("> ")) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].trimStart().startsWith("> ")) {
        quoteLines.push(lines[i].trimStart().slice(2));
        i++;
      }
      elements.push(
        <blockquote key={elements.length} className="my-2 border-l-2 border-zinc-600 pl-3">
          {quoteLines.map((ql, idx) => (
            <p key={idx} className="text-sm italic text-zinc-400">
              {renderInline(ql)}
            </p>
          ))}
        </blockquote>,
      );
      continue;
    }

    // ── Heading ──────────────────────────────
    if (line.startsWith("#### ")) {
      elements.push(<h5 key={elements.length} className="mb-1 mt-2 text-xs font-medium text-zinc-400">{renderInline(line.slice(5))}</h5>);
      i++; continue;
    }
    if (line.startsWith("### ")) {
      elements.push(<h4 key={elements.length} className="mb-1 mt-3 text-xs font-semibold uppercase tracking-wider text-zinc-400">{renderInline(line.slice(4))}</h4>);
      i++; continue;
    }
    if (line.startsWith("## ")) {
      elements.push(<h3 key={elements.length} className="mb-1.5 mt-3 text-sm font-semibold text-zinc-200">{renderInline(line.slice(3))}</h3>);
      i++; continue;
    }
    if (line.startsWith("# ")) {
      elements.push(<h2 key={elements.length} className="mb-2 mt-4 text-base font-bold text-zinc-100">{renderInline(line.slice(2))}</h2>);
      i++; continue;
    }

    // ── Unordered list ───────────────────────
    if (/^\s*[-*]\s/.test(line)) {
      const { node, endIndex } = parseList(lines, i, "ul");
      elements.push(<React.Fragment key={elements.length}>{node}</React.Fragment>);
      i = endIndex;
      continue;
    }

    // ── Ordered list ─────────────────────────
    if (/^\s*\d+\.\s/.test(line)) {
      const { node, endIndex } = parseList(lines, i, "ol");
      elements.push(<React.Fragment key={elements.length}>{node}</React.Fragment>);
      i = endIndex;
      continue;
    }

    // ── Paragraph ────────────────────────────
    elements.push(
      <p key={elements.length} className="text-sm leading-relaxed text-zinc-300">
        {renderInline(line)}
      </p>,
    );
    i++;
  }

  return <div className={`space-y-1 ${className}`}>{elements}</div>;
}

// ── Nested List Parser ───────────────────────

function getIndent(line: string): number {
  const match = line.match(/^(\s*)/);
  return match ? match[1].length : 0;
}

function parseList(
  lines: string[],
  startIndex: number,
  type: "ul" | "ol",
): { node: React.ReactNode; endIndex: number } {
  const items: React.ReactNode[] = [];
  let i = startIndex;
  const baseIndent = getIndent(lines[i]);

  while (i < lines.length) {
    const line = lines[i];
    const indent = getIndent(line);
    const trimmed = line.trimStart();

    const isUl = /^[-*]\s/.test(trimmed);
    const isOl = /^\d+\.\s/.test(trimmed);

    if (!isUl && !isOl) break;
    if (indent < baseIndent) break;

    if (indent > baseIndent) {
      // Nested list
      const nestedType = isOl ? "ol" : "ul";
      const nested = parseList(lines, i, nestedType);
      // Append to last item
      items.push(nested.node);
      i = nested.endIndex;
      continue;
    }

    // Same level item
    const text = isOl ? trimmed.replace(/^\d+\.\s/, "") : trimmed.slice(2);
    items.push(
      <li key={items.length} className="text-sm leading-relaxed text-zinc-300">
        {renderInline(text)}
      </li>,
    );
    i++;
  }

  const listClass = type === "ul"
    ? "my-1 list-disc space-y-0.5 pl-5 marker:text-zinc-600"
    : "my-1 list-decimal space-y-0.5 pl-5 marker:text-zinc-500 marker:font-mono marker:text-xs";

  const node = type === "ul"
    ? <ul className={listClass}>{items}</ul>
    : <ol className={listClass}>{items}</ol>;

  return { node, endIndex: i };
}

// ── Table Renderer ───────────────────────────

function MarkdownTable({ lines }: { lines: string[] }) {
  if (lines.length < 2) return null;

  const parseRow = (line: string) =>
    line.split("|").map((c) => c.trim()).filter(Boolean);

  const headers = parseRow(lines[0]);
  // Skip separator line (index 1)
  const rows = lines.slice(2).map(parseRow);

  return (
    <div className="my-2 overflow-x-auto rounded-md border border-zinc-800">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-zinc-800 bg-zinc-900/50">
            {headers.map((h, idx) => (
              <th key={idx} className="px-3 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                {renderInline(h)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-800/50">
          {rows.map((row, rIdx) => (
            <tr key={rIdx}>
              {row.map((cell, cIdx) => (
                <td key={cIdx} className="px-3 py-1.5 text-zinc-300">
                  {renderInline(cell)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Inline Formatting ────────────────────────
// Supports: **bold**, *italic*, `code`, [link](url), ~~strikethrough~~
// All length-bounded to prevent ReDoS.

function renderInline(text: string): React.ReactNode {
  const capped = text.length > 5000 ? text.slice(0, 5000) + "..." : text;
  const parts: React.ReactNode[] = [];
  let remaining = capped;
  let key = 0;

  while (remaining.length > 0 && key < 500) {
    // Find earliest match among all patterns
    const candidates: Array<{ type: string; match: RegExpMatchArray }> = [];

    const bold = remaining.match(/\*\*(.{1,300}?)\*\*/);
    if (bold) candidates.push({ type: "bold", match: bold });

    const italic = remaining.match(/(?<!\*)\*([^*]{1,200}?)\*(?!\*)/);
    if (italic) candidates.push({ type: "italic", match: italic });

    const code = remaining.match(/`([^`]{1,300})`/);
    if (code) candidates.push({ type: "code", match: code });

    const strike = remaining.match(/~~(.{1,200}?)~~/);
    if (strike) candidates.push({ type: "strike", match: strike });

    const link = remaining.match(/\[([^\]]{1,200})\]\(([^)]{1,500})\)/);
    if (link) candidates.push({ type: "link", match: link });

    if (candidates.length === 0) {
      parts.push(remaining);
      break;
    }

    // Pick the earliest match
    candidates.sort((a, b) => (a.match.index ?? 0) - (b.match.index ?? 0));
    const first = candidates[0];
    const idx = first.match.index ?? 0;

    if (idx > 0) parts.push(remaining.slice(0, idx));

    switch (first.type) {
      case "bold":
        parts.push(<strong key={key++} className="font-semibold text-zinc-100">{first.match[1]}</strong>);
        break;
      case "italic":
        parts.push(<em key={key++} className="text-zinc-200">{first.match[1]}</em>);
        break;
      case "code":
        parts.push(<code key={key++} className="rounded bg-zinc-800 px-1 py-0.5 font-mono text-xs text-emerald-400">{first.match[1]}</code>);
        break;
      case "strike":
        parts.push(<s key={key++} className="text-zinc-500">{first.match[1]}</s>);
        break;
      case "link":
        parts.push(
          <a key={key++} href={first.match[2]} target="_blank" rel="noopener noreferrer" className="text-emerald-400 underline decoration-emerald-400/30 hover:decoration-emerald-400">
            {first.match[1]}
          </a>,
        );
        break;
    }

    remaining = remaining.slice(idx + first.match[0].length);
  }

  return parts.length === 1 ? parts[0] : <>{parts}</>;
}
