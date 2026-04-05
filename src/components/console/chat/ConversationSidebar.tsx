"use client";

/**
 * ConversationSidebar — Left panel with conversation history.
 * Features: search, date grouping, inline rename, hover delete.
 */

import { useState, useRef, useEffect } from "react";
import type { Conversation } from "@/lib/chat-types";

interface ConversationSidebarProps {
  conversations: Conversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

function groupByDate(conversations: Conversation[]): Map<string, Conversation[]> {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86_400_000);
  const weekAgo = new Date(today.getTime() - 7 * 86_400_000);

  const groups = new Map<string, Conversation[]>();
  for (const conv of conversations) {
    const d = new Date(conv.updatedAt);
    let label: string;
    if (d >= today) label = "Today";
    else if (d >= yesterday) label = "Yesterday";
    else if (d >= weekAgo) label = "This week";
    else label = "Older";

    if (!groups.has(label)) groups.set(label, []);
    groups.get(label)!.push(conv);
  }
  return groups;
}

export function ConversationSidebar({
  conversations,
  activeId,
  onSelect,
  onNew,
  onDelete,
  onRename,
  collapsed = false,
  onToggleCollapse,
}: ConversationSidebarProps) {
  const [search, setSearch] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameText, setRenameText] = useState("");
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const renameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (renamingId && renameRef.current) renameRef.current.focus();
  }, [renamingId]);

  const filtered = search.trim()
    ? conversations.filter((c) =>
        (c.title || "").toLowerCase().includes(search.toLowerCase()),
      )
    : conversations;

  const groups = groupByDate(filtered);

  function startRename(conv: Conversation) {
    setRenamingId(conv.id);
    setRenameText(conv.title || "");
  }

  function submitRename() {
    if (renamingId && renameText.trim()) {
      onRename(renamingId, renameText.trim());
    }
    setRenamingId(null);
  }

  if (collapsed) {
    return null;
  }

  return (
    <div className="flex w-64 flex-col border-r border-edge bg-surface-inset">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-edge px-3 py-2.5">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-content-muted">Conversations</span>
        <div className="flex items-center gap-1">
          <button onClick={onToggleCollapse} className="rounded p-1 text-content-muted hover:bg-surface-card-hover hover:text-content-secondary" title="Collapse">
            <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none"><path d="M10 4L6 8l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="px-2 py-2">
        <div className="relative">
          <svg className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-content-faint" viewBox="0 0 16 16" fill="none">
            <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.25" />
            <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search..."
            className="w-full rounded-md border border-edge bg-surface-card py-1.5 pl-8 pr-2 text-xs text-content-secondary placeholder-content-faint outline-none focus:border-edge-focus"
          />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-content-faint hover:text-content-tertiary">
              <svg className="h-3 w-3" viewBox="0 0 16 16" fill="none"><path d="M4.75 4.75l6.5 6.5M11.25 4.75l-6.5 6.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
            </button>
          )}
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-2 pb-2">
        {filtered.length === 0 && (
          <div className="px-2 py-6 text-center text-xs text-content-faint">
            {search ? "No matches" : "No conversations yet"}
          </div>
        )}

        {Array.from(groups.entries()).map(([label, convs]) => (
          <div key={label} className="mb-2">
            <div className="px-2 py-1.5">
              <span className="text-[10px] font-medium text-content-faint">{label}</span>
            </div>
            {convs.map((conv) => (
              <div
                key={conv.id}
                onMouseEnter={() => setHoveredId(conv.id)}
                onMouseLeave={() => setHoveredId(null)}
                className={`group flex w-full items-center gap-1 rounded-md px-2.5 py-1.5 transition-colors ${
                  activeId === conv.id ? "bg-surface-card text-content" : "text-content-tertiary hover:bg-surface-card/50 hover:text-content-secondary"
                }`}
              >
                {renamingId === conv.id ? (
                  <input
                    ref={renameRef}
                    value={renameText}
                    onChange={(e) => setRenameText(e.target.value)}
                    onBlur={submitRename}
                    onKeyDown={(e) => { if (e.key === "Enter") submitRename(); if (e.key === "Escape") setRenamingId(null); }}
                    className="min-w-0 flex-1 rounded bg-surface-card px-1 py-0.5 text-xs text-content outline-none ring-1 ring-emerald-600"
                  />
                ) : (
                  <button onClick={() => onSelect(conv.id)} className="min-w-0 flex-1 truncate text-left text-xs">
                    {conv.title || "Untitled"}
                  </button>
                )}

                {hoveredId === conv.id && renamingId !== conv.id && (
                  <div className="flex shrink-0 items-center gap-0.5">
                    <button onClick={() => startRename(conv)} className="rounded p-0.5 text-content-faint hover:bg-surface-card-hover hover:text-content-tertiary" title="Rename">
                      <svg className="h-3 w-3" viewBox="0 0 16 16" fill="none"><path d="M11.5 1.5l3 3-9 9H2.5v-3l9-9z" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); onDelete(conv.id); }} className="rounded p-0.5 text-content-faint hover:bg-surface-card-hover hover:text-red-400" title="Delete">
                      <svg className="h-3 w-3" viewBox="0 0 16 16" fill="none"><path d="M4.75 4.75l6.5 6.5M11.25 4.75l-6.5 6.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
