"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";

// ──────────────────────────────────────────────
// Command Palette (Cmd+K)
//
// Global search + keyboard shortcuts for admin.
// - Cmd+K / Ctrl+K opens the palette
// - g o / g m / g n / g a for quick nav
// - ? shows shortcut help
// ──────────────────────────────────────────────

interface PageEntry {
  title: string;
  href: string;
  description: string;
  icon: string; // SVG path
}

const PAGES: PageEntry[] = [
  {
    title: "Overview",
    href: "/app/admin/overview",
    description: "Platform dashboard and KPIs",
    icon: "M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25",
  },
  {
    title: "Organizations",
    href: "/app/admin/organizations",
    description: "Manage tenants",
    icon: "M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 0h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008z",
  },
  {
    title: "Marketing",
    href: "/app/admin/marketing",
    description: "Analytics, A/B tests, pixels",
    icon: "M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z",
  },
  {
    title: "Newsletters",
    href: "/app/admin/newsletters",
    description: "Compose and send newsletters",
    icon: "M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75",
  },
  {
    title: "Usage & Billing",
    href: "/app/admin/usage-billing",
    description: "Capacity and costs",
    icon: "M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
  },
  {
    title: "Pricing",
    href: "/app/admin/pricing",
    description: "Plan configuration",
    icon: "M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 005.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 009.568 3z M6 6h.008v.008H6V6z",
  },
  {
    title: "System Health",
    href: "/app/admin/system-health",
    description: "Infrastructure status",
    icon: "M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z",
  },
  {
    title: "Error Tracking",
    href: "/app/admin/errors",
    description: "Platform errors",
    icon: "M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z",
  },
  {
    title: "Audit Log",
    href: "/app/admin/audit-log",
    description: "Admin action history",
    icon: "M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z",
  },
  {
    title: "Alerts",
    href: "/app/admin/alerts",
    description: "Threshold monitoring",
    icon: "M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0",
  },
  {
    title: "Platform Config",
    href: "/app/admin/platform-config",
    description: "Integration settings",
    icon: "M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z M15 12a3 3 0 11-6 0 3 3 0 016 0z",
  },
];

const SHORTCUTS = [
  { keys: ["Cmd", "K"], description: "Open command palette" },
  { keys: ["g", "o"], description: "Go to Overview" },
  { keys: ["g", "m"], description: "Go to Marketing" },
  { keys: ["g", "n"], description: "Go to Newsletters" },
  { keys: ["g", "a"], description: "Go to Organizations" },
  { keys: ["?"], description: "Show keyboard shortcuts" },
];

export default function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // ── Filtered results ──
  const filtered = query.trim()
    ? PAGES.filter(
        (p) =>
          p.title.toLowerCase().includes(query.toLowerCase()) ||
          p.description.toLowerCase().includes(query.toLowerCase())
      )
    : PAGES;

  // ── Reset selection when query changes ──
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // ── Scroll selected item into view ──
  useEffect(() => {
    if (!listRef.current) return;
    const items = listRef.current.querySelectorAll("[data-result-item]");
    const item = items[selectedIndex] as HTMLElement | undefined;
    if (item) {
      item.scrollIntoView({ block: "nearest" });
    }
  }, [selectedIndex]);

  // ── Cmd+K listener + keyboard shortcuts ──
  const pendingGRef = useRef(false);
  const pendingGTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Ignore if user is typing in an input/textarea (except our palette input)
      const tag = (e.target as HTMLElement)?.tagName;
      const isInputField = tag === "INPUT" || tag === "TEXTAREA" || (e.target as HTMLElement)?.isContentEditable;

      // Cmd+K / Ctrl+K always opens palette
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
        setQuery("");
        setSelectedIndex(0);
        return;
      }

      // If palette is open, don't process shortcuts
      if (open) return;

      // Skip shortcuts when typing in inputs
      if (isInputField) return;

      // ? shows shortcuts
      if (e.key === "?" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        setShowShortcuts(true);
        return;
      }

      // g + second key shortcuts
      if (pendingGRef.current) {
        pendingGRef.current = false;
        if (pendingGTimerRef.current) {
          clearTimeout(pendingGTimerRef.current);
          pendingGTimerRef.current = null;
        }

        const routes: Record<string, string> = {
          o: "/app/admin/overview",
          m: "/app/admin/marketing",
          n: "/app/admin/newsletters",
          a: "/app/admin/organizations",
        };

        if (routes[e.key]) {
          e.preventDefault();
          router.push(routes[e.key]);
        }
        return;
      }

      if (e.key === "g" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        pendingGRef.current = true;
        pendingGTimerRef.current = setTimeout(() => {
          pendingGRef.current = false;
        }, 500);
        return;
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, router]);

  // ── Focus input when palette opens ──
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [open]);

  // ── Navigate to a page ──
  const navigateTo = useCallback(
    (href: string) => {
      setOpen(false);
      setQuery("");
      router.push(href);
    },
    [router]
  );

  // ── Palette keyboard navigation ──
  function handlePaletteKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filtered[selectedIndex]) {
        navigateTo(filtered[selectedIndex].href);
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      setQuery("");
    }
  }

  return (
    <>
      {/* ── Command Palette Modal ── */}
      {open && (
        <div className="fixed inset-0 z-[100] flex items-start justify-center px-4 pt-[15vh] sm:px-0 sm:pt-[20vh]">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => {
              setOpen(false);
              setQuery("");
            }}
          />

          {/* Modal */}
          <div className="relative w-full max-w-sm overflow-hidden rounded-xl border border-white/10 bg-[#181822] shadow-2xl shadow-black/50 sm:max-w-lg">
            {/* Search input */}
            <div className="flex items-center gap-3 border-b border-white/[0.06] px-4">
              <svg
                className="h-4 w-4 shrink-0 text-white/30"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
                />
              </svg>
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handlePaletteKeyDown}
                placeholder="Search pages..."
                className="flex-1 bg-transparent py-3.5 text-sm text-white placeholder:text-white/30 focus:outline-none"
              />
              <kbd className="hidden rounded border border-white/10 px-1.5 py-0.5 text-[10px] font-medium text-white/25 sm:inline-block">
                ESC
              </kbd>
            </div>

            {/* Results */}
            <div ref={listRef} className="max-h-[min(320px,50vh)] overflow-y-auto py-2">
              {filtered.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-white/30">
                  No results for &ldquo;{query}&rdquo;
                </div>
              ) : (
                <>
                  <div className="px-4 pb-1 pt-1">
                    <span className="text-[10px] font-semibold uppercase tracking-widest text-white/25">
                      Pages
                    </span>
                  </div>
                  {filtered.map((page, i) => (
                    <button
                      key={page.href}
                      data-result-item
                      onClick={() => navigateTo(page.href)}
                      className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                        i === selectedIndex
                          ? "bg-white/5 text-white"
                          : "text-white/60 hover:bg-white/[0.03]"
                      }`}
                    >
                      <div
                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                          i === selectedIndex
                            ? "bg-white/10 text-white"
                            : "bg-white/[0.04] text-white/40"
                        }`}
                      >
                        <svg
                          className="h-4 w-4"
                          fill="none"
                          viewBox="0 0 24 24"
                          strokeWidth={1.5}
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d={page.icon}
                          />
                        </svg>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {page.title}
                        </p>
                        <p className="truncate text-xs text-white/30">
                          {page.description}
                        </p>
                      </div>
                      {i === selectedIndex && (
                        <kbd className="shrink-0 rounded border border-white/10 px-1.5 py-0.5 text-[10px] text-white/25">
                          &crarr;
                        </kbd>
                      )}
                    </button>
                  ))}
                </>
              )}
            </div>

            {/* Footer hints */}
            <div className="flex items-center gap-4 border-t border-white/[0.06] px-4 py-2">
              <span className="flex items-center gap-1 text-[10px] text-white/25">
                <kbd className="rounded border border-white/10 px-1 py-0.5">&uarr;</kbd>
                <kbd className="rounded border border-white/10 px-1 py-0.5">&darr;</kbd>
                navigate
              </span>
              <span className="flex items-center gap-1 text-[10px] text-white/25">
                <kbd className="rounded border border-white/10 px-1 py-0.5">&crarr;</kbd>
                select
              </span>
              <span className="flex items-center gap-1 text-[10px] text-white/25">
                <kbd className="rounded border border-white/10 px-1 py-0.5">esc</kbd>
                close
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ── Shortcuts Help Modal ── */}
      {showShortcuts && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setShowShortcuts(false)}
          />
          <div className="relative w-full max-w-sm overflow-hidden rounded-xl border border-white/10 bg-[#181822] shadow-2xl shadow-black/50">
            <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-3.5">
              <h2 className="text-sm font-semibold text-white">
                Keyboard Shortcuts
              </h2>
              <button
                onClick={() => setShowShortcuts(false)}
                className="rounded p-1 text-white/30 hover:bg-white/[0.06] hover:text-white/60"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="divide-y divide-white/[0.04] px-5 py-2">
              {SHORTCUTS.map((s, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between py-2.5"
                >
                  <span className="text-xs text-white/50">
                    {s.description}
                  </span>
                  <div className="flex items-center gap-1">
                    {s.keys.map((k, j) => (
                      <span key={j}>
                        {j > 0 && (
                          <span className="mx-0.5 text-[10px] text-white/20">
                            +
                          </span>
                        )}
                        <kbd className="rounded border border-white/10 bg-white/[0.04] px-1.5 py-0.5 text-[10px] font-medium text-white/40">
                          {k}
                        </kbd>
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="border-t border-white/[0.06] px-5 py-2.5 text-center">
              <span className="text-[10px] text-white/20">
                Press <kbd className="rounded border border-white/10 px-1 py-0.5 text-white/30">ESC</kbd> to close
              </span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
