"use client";

import { useState } from "react";

// ── Tab definitions ──

const tabs = [
  {
    id: "actions",
    label: "Actions",
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
        <path d="M11 2L4.5 11.5H10L9 18L15.5 8.5H10L11 2Z" />
      </svg>
    ),
  },
  {
    id: "analysis",
    label: "Analysis",
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 16V10" />
        <path d="M7 16V6" />
        <path d="M11 16V8" />
        <path d="M15 16V3" />
      </svg>
    ),
  },
  {
    id: "inventory",
    label: "Inventory",
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="14" height="14" rx="2" />
        <path d="M3 8H17" />
        <path d="M8 8V17" />
      </svg>
    ),
  },
  {
    id: "workspaces",
    label: "Workspaces",
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="2" width="7" height="7" rx="1.5" />
        <rect x="11" y="2" width="7" height="7" rx="1.5" />
        <rect x="2" y="11" width="7" height="7" rx="1.5" />
        <rect x="11" y="11" width="7" height="7" rx="1.5" />
      </svg>
    ),
  },
  {
    id: "chat",
    label: "Chat",
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 4H16C16.5523 4 17 4.44772 17 5V13C17 13.5523 16.5523 14 16 14H7L3 17V5C3 4.44772 3.44772 4 4 4Z" />
      </svg>
    ),
  },
  {
    id: "maps",
    label: "Maps",
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="5" cy="5" r="2" />
        <circle cx="15" cy="5" r="2" />
        <circle cx="10" cy="15" r="2" />
        <path d="M7 5H13" />
        <path d="M6.5 6.5L8.5 13.5" />
        <path d="M13.5 6.5L11.5 13.5" />
      </svg>
    ),
  },
] as const;

type TabId = (typeof tabs)[number]["id"];

// ── Severity / priority helpers ──

function SeverityBadge({ level }: { level: "critical" | "high" | "medium" | "low" }) {
  const styles: Record<string, string> = {
    critical: "bg-red-500/15 text-red-400 border-red-500/20",
    high: "bg-orange-500/15 text-orange-400 border-orange-500/20",
    medium: "bg-amber-500/15 text-amber-400 border-amber-500/20",
    low: "bg-blue-500/15 text-blue-400 border-blue-500/20",
  };
  return (
    <span className={`inline-block rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${styles[level]}`}>
      {level}
    </span>
  );
}

function PriorityTag({ p }: { p: string }) {
  return (
    <span className="inline-flex h-6 w-7 items-center justify-center rounded bg-white/[0.06] text-[10px] font-bold text-zinc-400">
      {p}
    </span>
  );
}

// ── Tab content panels ──

function ActionsPanel() {
  const actions = [
    { p: "P1", title: "Fix checkout redirect chain", impact: "$18k-42k/mo", severity: "critical" as const },
    { p: "P2", title: "Add refund policy page", impact: "$3.6k-9k/mo", severity: "high" as const },
    { p: "P3", title: "Enable mobile add-to-cart", impact: "$18k-42k/mo", severity: "critical" as const },
    { p: "P4", title: "Add analytics to checkout", impact: "$9.6k-24k/mo", severity: "medium" as const },
  ];

  return (
    <div className="space-y-2">
      <div className="mb-3 flex items-center justify-between">
        <h4 className="text-xs font-semibold uppercase tracking-widest text-zinc-500">Action Queue</h4>
        <span className="text-[10px] text-zinc-600">4 actions</span>
      </div>
      {actions.map((a) => (
        <div
          key={a.p}
          className="flex items-center gap-3 rounded-lg border border-zinc-800/60 bg-white/[0.02] px-3 py-2.5 transition-colors hover:bg-white/[0.04]"
        >
          <PriorityTag p={a.p} />
          <span className="min-w-0 flex-1 truncate text-sm text-zinc-300">{a.title}</span>
          <span className="hidden shrink-0 text-xs font-medium text-emerald-400 sm:inline">{a.impact}</span>
          <SeverityBadge level={a.severity} />
        </div>
      ))}
    </div>
  );
}

function AnalysisPanel() {
  const summaryCards = [
    { label: "Findings", value: "12 issues, 4 strengths" },
    { label: "Est. Impact", value: "$67.2k" },
    { label: "High Impact", value: "4" },
    { label: "Avg Confidence", value: "82%" },
  ];

  const findings = [
    { title: "Checkout redirect chain adds 2.4s latency", severity: "critical" as const },
    { title: "Missing refund policy raises chargeback risk", severity: "high" as const },
    { title: "Mobile add-to-cart button below fold", severity: "critical" as const },
  ];

  return (
    <div>
      <h4 className="mb-3 text-xs font-semibold uppercase tracking-widest text-zinc-500">Analysis Summary</h4>
      <div className="mb-4 grid grid-cols-2 gap-2 md:grid-cols-4">
        {summaryCards.map((c) => (
          <div key={c.label} className="rounded-lg border border-zinc-800/60 bg-white/[0.02] p-3">
            <div className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">{c.label}</div>
            <div className="mt-1 text-sm font-semibold text-white">{c.value}</div>
          </div>
        ))}
      </div>
      <div className="space-y-1.5">
        {findings.map((f, i) => (
          <div key={i} className="flex items-center gap-3 rounded-lg border border-zinc-800/60 bg-white/[0.02] px-3 py-2">
            <span className="min-w-0 flex-1 truncate text-xs text-zinc-400">{f.title}</span>
            <SeverityBadge level={f.severity} />
          </div>
        ))}
      </div>
    </div>
  );
}

function InventoryPanel() {
  const surfaces = [
    { path: "/", label: "Homepage", status: "Live", code: 200, findings: 3 },
    { path: "/products", label: "Products", status: "Live", code: 200, findings: 2 },
    { path: "/cart", label: "Cart", status: "Live", code: 200, findings: 4 },
    { path: "/checkout", label: "Checkout", status: "Live", code: 200, findings: 6 },
    { path: "/thank-you", label: "Thank You", status: "Down", code: 503, findings: 1 },
  ];

  return (
    <div>
      <h4 className="mb-3 text-xs font-semibold uppercase tracking-widest text-zinc-500">Surface Inventory</h4>

      {/* Mobile: stacked cards */}
      <div className="space-y-2 sm:hidden">
        {surfaces.map((s) => (
          <div key={s.path} className="rounded-lg border border-zinc-800/60 bg-white/[0.02] p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-sm font-medium text-zinc-200">{s.label}</span>
              <span className={`inline-flex shrink-0 items-center gap-1.5 text-[10px] font-semibold ${s.status === "Live" ? "text-emerald-400" : "text-red-400"}`}>
                <span className={`inline-block h-1.5 w-1.5 rounded-full ${s.status === "Live" ? "bg-emerald-400" : "bg-red-400"}`} />
                {s.status}
              </span>
            </div>
            <div className="mt-1.5 flex items-center justify-between gap-2 text-[11px]">
              <span className="truncate font-mono text-zinc-500">{s.path}</span>
              <div className="flex shrink-0 items-center gap-3">
                <span className={`font-mono ${s.code >= 500 ? "text-red-400" : "text-zinc-600"}`}>{s.code}</span>
                <span className="text-zinc-400">{s.findings} {s.findings === 1 ? "finding" : "findings"}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Desktop: table */}
      <div className="hidden overflow-x-auto sm:block">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-zinc-800/60 text-[10px] font-semibold uppercase tracking-wider text-zinc-600">
              <th className="pb-2 pr-4">Surface</th>
              <th className="pb-2 pr-4">Path</th>
              <th className="pb-2 pr-4">Status</th>
              <th className="pb-2 pr-4">HTTP</th>
              <th className="pb-2 text-right">Findings</th>
            </tr>
          </thead>
          <tbody>
            {surfaces.map((s) => (
              <tr key={s.path} className="border-b border-zinc-800/30">
                <td className="py-2 pr-4 text-zinc-300">{s.label}</td>
                <td className="py-2 pr-4 font-mono text-zinc-500">{s.path}</td>
                <td className="py-2 pr-4">
                  <span className={`inline-flex items-center gap-1.5 text-[10px] font-semibold ${s.status === "Live" ? "text-emerald-400" : "text-red-400"}`}>
                    <span className={`inline-block h-1.5 w-1.5 rounded-full ${s.status === "Live" ? "bg-emerald-400" : "bg-red-400"}`} />
                    {s.status}
                  </span>
                </td>
                <td className={`py-2 pr-4 font-mono ${s.code >= 500 ? "text-red-400" : "text-zinc-500"}`}>{s.code}</td>
                <td className="py-2 text-right text-zinc-400">{s.findings}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function WorkspacesPanel() {
  const workspaces = [
    { name: "Scale Readiness", urgency: "BLOCK", color: "text-red-400 bg-red-500/10 border-red-500/20", desc: "Critical blockers for scaling infrastructure" },
    { name: "Revenue Integrity", urgency: "FIX", color: "text-orange-400 bg-orange-500/10 border-orange-500/20", desc: "Revenue leaks and conversion issues" },
    { name: "Chargeback Resilience", urgency: "MODERATE", color: "text-amber-400 bg-amber-500/10 border-amber-500/20", desc: "Chargeback prevention and dispute readiness" },
  ];

  return (
    <div>
      <h4 className="mb-3 text-xs font-semibold uppercase tracking-widest text-zinc-500">Workspaces</h4>
      <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
        {workspaces.map((w) => (
          <div key={w.name} className="rounded-lg border border-zinc-800/60 bg-white/[0.02] p-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-semibold text-white">{w.name}</span>
              <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${w.color}`}>
                {w.urgency}
              </span>
            </div>
            <p className="text-[11px] leading-relaxed text-zinc-500">{w.desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function ChatPanel() {
  return (
    <div>
      <h4 className="mb-3 text-xs font-semibold uppercase tracking-widest text-zinc-500">Agentic Chat</h4>
      <div className="space-y-3">
        {/* User message */}
        <div className="flex justify-end">
          <div className="max-w-[92%] rounded-xl rounded-br-sm border border-zinc-800/60 bg-white/[0.04] px-3 py-2 sm:max-w-[80%] sm:px-4 sm:py-2.5">
            <p className="text-xs text-zinc-300">&ldquo;Where am I losing the most money?&rdquo;</p>
          </div>
        </div>
        {/* AI response */}
        <div className="flex justify-start">
          <div className="max-w-[95%] rounded-xl rounded-bl-sm border border-violet-500/20 bg-violet-500/[0.04] px-3 py-3 sm:max-w-[85%] sm:px-4">
            <div className="mb-1.5 flex items-center gap-1.5">
              <div className="h-1.5 w-1.5 rounded-full bg-violet-400" />
              <span className="text-[10px] font-semibold uppercase tracking-wide text-violet-400">Vestigio AI</span>
            </div>
            <p className="text-xs leading-relaxed text-zinc-300">
              Your biggest revenue leak is the checkout redirect chain. It adds 2.4s of latency and is estimated to cost{" "}
              <span className="font-medium text-emerald-400">$18k-42k/mo</span> in lost conversions. I&apos;ve created an action to address this at P1 priority.
            </p>
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              <span className="rounded bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-400">Used 3 Findings</span>
              <span className="rounded bg-violet-500/10 px-2 py-0.5 text-[10px] font-medium text-violet-400">Created Action</span>
            </div>
          </div>
        </div>
        {/* Input placeholder */}
        <div className="flex items-center gap-2 rounded-lg border border-zinc-800/60 bg-white/[0.02] px-3 py-2.5">
          <span className="flex-1 text-xs text-zinc-600">Ask anything about your business...</span>
          <div className="grid h-6 w-6 place-items-center rounded bg-white/[0.06]">
            <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-500">
              <path d="M5 10H15" />
              <path d="M10 5L15 10L10 15" />
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}

function MapsPanel() {
  return (
    <div>
      <h4 className="mb-3 text-xs font-semibold uppercase tracking-widest text-zinc-500">Journey Map</h4>
      <div className="relative flex min-h-[200px] items-center justify-center">
        {/* Nodes — stacked vertically on mobile, horizontal flow on sm+ */}
        <div className="relative flex flex-col items-center justify-center gap-y-3 sm:flex-row sm:flex-wrap sm:gap-x-10 sm:gap-y-8">
          {/* Homepage node */}
          <div className="relative z-10 flex flex-col items-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-emerald-500/30 bg-emerald-500/10">
              <span className="text-[10px] font-bold text-emerald-400">/</span>
            </div>
            <span className="mt-1.5 text-[10px] text-zinc-500">Home</span>
          </div>

          {/* Arrow — horizontal on sm+, downward on mobile */}
          <svg width="32" height="12" viewBox="0 0 32 12" fill="none" className="hidden text-zinc-700 sm:block">
            <path d="M0 6H28" stroke="currentColor" strokeWidth="1.2" />
            <path d="M24 2L28 6L24 10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <svg width="10" height="16" viewBox="0 0 10 16" fill="none" className="block text-zinc-700 sm:hidden" aria-hidden>
            <path d="M5 0V12" stroke="currentColor" strokeWidth="1.2" />
            <path d="M1.5 10L5 13.5L8.5 10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>

          {/* Products node */}
          <div className="relative z-10 flex flex-col items-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-blue-500/30 bg-blue-500/10">
              <span className="text-[9px] font-bold text-blue-400">/prod</span>
            </div>
            <span className="mt-1.5 text-[10px] text-zinc-500">Products</span>
          </div>

          {/* Arrow — horizontal on sm+, downward on mobile */}
          <svg width="32" height="12" viewBox="0 0 32 12" fill="none" className="hidden text-zinc-700 sm:block">
            <path d="M0 6H28" stroke="currentColor" strokeWidth="1.2" />
            <path d="M24 2L28 6L24 10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <svg width="10" height="16" viewBox="0 0 10 16" fill="none" className="block text-zinc-700 sm:hidden" aria-hidden>
            <path d="M5 0V12" stroke="currentColor" strokeWidth="1.2" />
            <path d="M1.5 10L5 13.5L8.5 10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>

          {/* Cart node */}
          <div className="relative z-10 flex flex-col items-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-amber-500/30 bg-amber-500/10">
              <span className="text-[9px] font-bold text-amber-400">/cart</span>
            </div>
            <span className="mt-1.5 text-[10px] text-zinc-500">Cart</span>
            <span className="mt-0.5 text-[9px] text-amber-400">4 findings</span>
          </div>

          {/* Arrow — horizontal on sm+, downward on mobile */}
          <svg width="32" height="12" viewBox="0 0 32 12" fill="none" className="hidden text-zinc-700 sm:block">
            <path d="M0 6H28" stroke="currentColor" strokeWidth="1.2" />
            <path d="M24 2L28 6L24 10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <svg width="10" height="16" viewBox="0 0 10 16" fill="none" className="block text-zinc-700 sm:hidden" aria-hidden>
            <path d="M5 0V12" stroke="currentColor" strokeWidth="1.2" />
            <path d="M1.5 10L5 13.5L8.5 10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>

          {/* Checkout node - highlighted as critical */}
          <div className="relative z-10 flex flex-col items-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-red-500/30 bg-red-500/10 shadow-[0_0_20px_-5px_rgba(239,68,68,0.3)]">
              <span className="text-[8px] font-bold text-red-400">/check</span>
            </div>
            <span className="mt-1.5 text-[10px] text-zinc-500">Checkout</span>
            <span className="mt-0.5 text-[9px] text-red-400">6 findings</span>
          </div>

          {/* Arrow — horizontal on sm+, downward on mobile */}
          <svg width="32" height="12" viewBox="0 0 32 12" fill="none" className="hidden text-zinc-700 sm:block">
            <path d="M0 6H28" stroke="currentColor" strokeWidth="1.2" />
            <path d="M24 2L28 6L24 10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <svg width="10" height="16" viewBox="0 0 10 16" fill="none" className="block text-zinc-700 sm:hidden" aria-hidden>
            <path d="M5 0V12" stroke="currentColor" strokeWidth="1.2" />
            <path d="M1.5 10L5 13.5L8.5 10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>

          {/* Thank you node */}
          <div className="relative z-10 flex flex-col items-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-zinc-700/50 bg-zinc-800/30">
              <span className="text-[8px] font-bold text-zinc-500">/thx</span>
            </div>
            <span className="mt-1.5 text-[10px] text-zinc-600">Thank You</span>
          </div>
        </div>
      </div>
    </div>
  );
}

const panelComponents: Record<TabId, () => JSX.Element> = {
  actions: ActionsPanel,
  analysis: AnalysisPanel,
  inventory: InventoryPanel,
  workspaces: WorkspacesPanel,
  chat: ChatPanel,
  maps: MapsPanel,
};

// ── Main Component ──

export default function ProductTour() {
  const [activeTab, setActiveTab] = useState<TabId>("actions");
  const ActivePanel = panelComponents[activeTab];

  return (
    <section className="relative bg-[#090911] py-16 sm:py-20 lg:py-28">
      {/* Background glow */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute left-1/2 top-[40%] h-[400px] w-[500px] -translate-x-1/2 rounded-full bg-violet-900/[0.06] blur-[120px] sm:h-[500px] sm:w-[600px] sm:blur-[160px]" />
      </div>

      {/* Section header */}
      <div className="mx-auto mb-10 max-w-[700px] px-4 text-center sm:mb-14 sm:px-8 lg:mb-18">
        <span className="mb-3 inline-block text-xs font-semibold uppercase tracking-[0.2em] text-violet-400">Product Tour</span>
        <h2 className="mb-4 text-[1.75rem] font-bold leading-[1.15] tracking-tight text-white sm:mb-5 sm:text-4xl lg:text-5xl">
          See what Vestigio shows you
        </h2>
        <p className="text-sm leading-relaxed text-gray-400 sm:text-base lg:text-lg">
          Explore the dashboard — every tab reveals actionable intelligence about your business.
        </p>
      </div>

      {/* Browser mockup frame */}
      <div className="mx-auto w-full max-w-[1100px] px-4 sm:px-8 xl:px-0">
        <div className="overflow-hidden rounded-xl border border-zinc-800/80 bg-[#0c0c14] shadow-[0_0_80px_-20px_rgba(139,92,246,0.12)] sm:rounded-2xl">

          {/* Browser title bar */}
          <div className="flex items-center gap-2 border-b border-zinc-800/60 bg-[#0a0a12] px-3 py-2.5 sm:px-4 sm:py-3">
            <div className="flex gap-1.5">
              <div className="h-2.5 w-2.5 rounded-full bg-zinc-700" />
              <div className="h-2.5 w-2.5 rounded-full bg-zinc-700" />
              <div className="h-2.5 w-2.5 rounded-full bg-zinc-700" />
            </div>
            <div className="ml-2 flex min-w-0 flex-1 sm:ml-3">
              <div className="mx-auto w-full max-w-[220px] truncate rounded-md bg-white/[0.04] px-3 py-1 text-center text-[10px] text-zinc-600 sm:max-w-[280px] sm:text-[11px]">
                app.vestigio.io/dashboard
              </div>
            </div>
            <div className="hidden w-[52px] sm:block" />
          </div>

          {/* App body: sidebar + content */}
          <div className="flex flex-col md:flex-row">

            {/* Mobile horizontal tabs — with fade indicators for scroll discoverability */}
            <div className="relative md:hidden">
              <div className="flex overflow-x-auto border-b border-zinc-800/60 bg-[#0a0a12]/50 [mask-image:linear-gradient(to_right,transparent_0,black_12px,black_calc(100%-12px),transparent_100%)]">
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex shrink-0 items-center gap-1.5 px-4 py-3 text-[11px] font-medium transition-colors ${
                      activeTab === tab.id
                        ? "border-b-2 border-violet-500 text-white"
                        : "text-zinc-500 hover:text-zinc-300"
                    }`}
                  >
                    <span className={activeTab === tab.id ? "text-violet-400" : "text-zinc-600"}>{tab.icon}</span>
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Desktop sidebar */}
            <div className="hidden w-[180px] shrink-0 border-r border-zinc-800/60 bg-[#0a0a12]/50 md:block">
              <div className="p-3">
                {/* App logo area */}
                <div className="mb-4 flex items-center gap-2 px-2 py-2">
                  <div className="grid h-6 w-6 place-items-center rounded-md bg-violet-500/15">
                    <div className="h-2 w-2 rounded-sm bg-violet-400" />
                  </div>
                  <span className="text-xs font-semibold text-zinc-400">Vestigio</span>
                </div>

                {/* Nav items */}
                <nav className="space-y-0.5">
                  {tabs.map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs font-medium transition-all ${
                        activeTab === tab.id
                          ? "bg-white/[0.06] text-white"
                          : "text-zinc-500 hover:bg-white/[0.03] hover:text-zinc-300"
                      }`}
                    >
                      <span className={activeTab === tab.id ? "text-violet-400" : "text-zinc-600"}>{tab.icon}</span>
                      {tab.label}
                    </button>
                  ))}
                </nav>
              </div>
            </div>

            {/* Content area — taller on desktop to match real browser proportions (was 380px, now 600-640px) */}
            <div className="min-h-[360px] flex-1 p-4 sm:p-6 md:min-h-[600px] lg:min-h-[640px] lg:p-8">
              <div
                key={activeTab}
                className="animate-[fadeIn_0.25s_ease-out]"
                style={{ animationFillMode: "both" }}
              >
                <ActivePanel />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Inline keyframes for fade animation */}
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(4px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </section>
  );
}
