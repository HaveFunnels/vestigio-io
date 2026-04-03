"use client";

import { useState, useEffect, useCallback } from "react";

// ──────────────────────────────────────────────
// Admin — Marketing Dashboard & Analytics
// Matches Overview / Usage & Billing visual identity.
// ──────────────────────────────────────────────

/* ========== Types ========== */

interface StatsData {
  period: string;
  summary: {
    totalPageViews: number;
    uniqueSessions: number;
    avgTimeOnPage: number;
    bounceRate: number;
  };
  pageViewsOverTime: { date: string; count: number }[];
  topPages: { path: string; views: number }[];
  topReferrers: { referrer: string; views: number }[];
  devices: Record<string, number>;
  utmSources: { source: string; views: number }[];
  funnel: {
    pageViews: number;
    uniqueSessions: number;
    ctaClicks: number;
    formStarts: number;
    formCompletes: number;
    signups: number;
  };
  topJourneys: { journey: string; count: number }[];
  dropOffs: { path: string; exits: number; exitRate: number }[];
}

interface ABTest {
  id: string;
  name: string;
  description: string | null;
  status: string;
  startDate: string | null;
  endDate: string | null;
  variants: string;
  variantPerformance: {
    id: string;
    name: string;
    weight: number;
    views: number;
    conversions: number;
    conversionRate: number;
  }[];
  createdAt: string;
}

interface HomepageVariant {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  heroTitle: string | null;
  heroSubtitle: string | null;
  ctaText: string | null;
  ctaUrl: string | null;
  isDefault: boolean;
  status: string;
  createdAt: string;
}

interface TrackingPixelData {
  id: string;
  name: string;
  type: string;
  pixelId: string;
  enabled: boolean;
  config: string | null;
  createdAt: string;
}

/* ========== Helpers ========== */

function formatNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toLocaleString();
}

function pct(n: number): string {
  return `${n}%`;
}

/* ========== Skeleton Components ========== */

function SkeletonCard() {
  return (
    <div className="relative overflow-hidden rounded-lg border border-edge bg-surface-card p-5">
      <div className="flex items-start justify-between">
        <div className="flex-1 space-y-3">
          <div className="h-3 w-20 animate-pulse rounded bg-white/[0.06]" />
          <div className="h-7 w-24 animate-pulse rounded bg-white/[0.06]" />
          <div className="h-3 w-32 animate-pulse rounded bg-white/[0.06]" />
        </div>
        <div className="h-10 w-10 animate-pulse rounded-lg bg-white/[0.06]" />
      </div>
    </div>
  );
}

function SkeletonRow() {
  return (
    <div className="flex items-center justify-between px-5 py-3">
      <div className="flex-1 space-y-2">
        <div className="h-4 w-32 animate-pulse rounded bg-white/[0.06]" />
        <div className="h-3 w-24 animate-pulse rounded bg-white/[0.06]" />
      </div>
      <div className="h-5 w-16 animate-pulse rounded bg-white/[0.06]" />
    </div>
  );
}

function SkeletonTable({ rows = 5 }: { rows?: number }) {
  return (
    <div className="divide-y divide-edge">
      {Array.from({ length: rows }).map((_, i) => (
        <SkeletonRow key={i} />
      ))}
    </div>
  );
}

/* ========== Stat Card ========== */

function StatCard({
  label,
  value,
  sub,
  accent,
  icon,
  warn,
  loading,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
  icon: React.ReactNode;
  warn?: boolean;
  loading?: boolean;
}) {
  if (loading) return <SkeletonCard />;

  return (
    <div className="group relative overflow-hidden rounded-lg border border-edge bg-surface-card p-5 transition-all duration-300 hover:bg-surface-card-hover">
      <div className="flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium uppercase tracking-wider text-content-muted">
            {label}
          </p>
          <p
            className={`mt-2 text-2xl font-bold tracking-tight ${
              warn
                ? "text-amber-400"
                : accent
                  ? "text-accent-text"
                  : "text-content"
            }`}
          >
            {value}
          </p>
          {sub && (
            <p className="mt-1 text-xs text-content-faint">{sub}</p>
          )}
        </div>
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition-colors ${
            warn
              ? "bg-amber-500/10 text-amber-400"
              : accent
                ? "bg-accent-subtle-bg/10 text-accent-text"
                : "bg-surface-inset text-content-muted"
          }`}
        >
          {icon}
        </div>
      </div>
    </div>
  );
}

/* ========== Inline SVG Icons ========== */

const icons = {
  eye: (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  ),
  users: (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
    </svg>
  ),
  clock: (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  arrowTrendingDown: (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6L9 12.75l4.286-4.286a11.948 11.948 0 014.306 6.43l.776 2.898M18.75 19.5l2.25-2.25-2.25-2.25" />
    </svg>
  ),
  megaphone: (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.34 15.84c-.688-.06-1.386-.09-2.09-.09H7.5a4.5 4.5 0 110-9h.75c.704 0 1.402-.03 2.09-.09m0 9.18c.253.962.584 1.892.985 2.783.247.55.06 1.21-.463 1.511l-.657.38c-.551.318-1.26.117-1.527-.461a20.845 20.845 0 01-1.44-4.282m3.102.069a18.03 18.03 0 01-.59-4.59c0-1.586.205-3.124.59-4.59m0 9.18a23.848 23.848 0 018.835 2.535M10.34 6.66a23.847 23.847 0 008.835-2.535m0 0A23.74 23.74 0 0018.795 3m.38 1.125a23.91 23.91 0 011.014 5.395m-1.014 8.855c-.118.38-.245.754-.38 1.125m.38-1.125a23.91 23.91 0 001.014-5.395m0-3.46c.495.413.811 1.035.811 1.73 0 .695-.316 1.317-.811 1.73m0-3.46a24.347 24.347 0 010 3.46" />
    </svg>
  ),
  beaker: (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0112 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5" />
    </svg>
  ),
  code: (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" />
    </svg>
  ),
  mapPin: (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
    </svg>
  ),
  plus: (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
    </svg>
  ),
  trash: (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
    </svg>
  ),
  arrowPath: (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 12c0-1.232-.046-2.453-.138-3.662a4.006 4.006 0 00-3.7-3.7 48.678 48.678 0 00-7.324 0 4.006 4.006 0 00-3.7 3.7c-.017.22-.032.441-.046.662M19.5 12l3-3m-3 3l-3-3m-12 3c0 1.232.046 2.453.138 3.662a4.006 4.006 0 003.7 3.7 48.656 48.656 0 007.324 0 4.006 4.006 0 003.7-3.7c.017-.22.032-.441.046-.662M4.5 12l3 3m-3-3l-3 3" />
    </svg>
  ),
};

/* ========== Mini Sparkline Chart (pure SVG) ========== */

function Sparkline({
  data,
  width = 600,
  height = 160,
}: {
  data: { date: string; count: number }[];
  width?: number;
  height?: number;
}) {
  if (!data.length) {
    return (
      <div
        className="flex items-center justify-center text-sm text-content-faint"
        style={{ height }}
      >
        No data for this period
      </div>
    );
  }

  const max = Math.max(...data.map((d) => d.count), 1);
  const padding = { top: 20, right: 20, bottom: 30, left: 50 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  const points = data.map((d, i) => {
    const x = padding.left + (i / Math.max(data.length - 1, 1)) * chartW;
    const y = padding.top + chartH - (d.count / max) * chartH;
    return { x, y, ...d };
  });

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
  const areaPath = `${linePath} L${points[points.length - 1].x},${padding.top + chartH} L${points[0].x},${padding.top + chartH} Z`;

  // Y-axis labels
  const yTicks = [0, Math.round(max / 2), max];

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full" preserveAspectRatio="xMidYMid meet">
      {/* Grid lines */}
      {yTicks.map((tick) => {
        const y = padding.top + chartH - (tick / max) * chartH;
        return (
          <g key={tick}>
            <line
              x1={padding.left}
              y1={y}
              x2={width - padding.right}
              y2={y}
              stroke="currentColor"
              className="text-white/[0.06]"
              strokeWidth={1}
            />
            <text
              x={padding.left - 8}
              y={y + 4}
              textAnchor="end"
              className="fill-content-faint"
              fontSize={10}
            >
              {formatNum(tick)}
            </text>
          </g>
        );
      })}

      {/* Area fill */}
      <path d={areaPath} className="fill-accent-text/10" />

      {/* Line */}
      <path d={linePath} fill="none" className="stroke-accent-text" strokeWidth={2} strokeLinejoin="round" />

      {/* Dots */}
      {points.map((p, i) => (
        <circle
          key={i}
          cx={p.x}
          cy={p.y}
          r={3}
          className="fill-accent-text"
        />
      ))}

      {/* X-axis labels (show a few) */}
      {points
        .filter((_, i) => i === 0 || i === points.length - 1 || i === Math.floor(points.length / 2))
        .map((p, i) => (
          <text
            key={i}
            x={p.x}
            y={height - 6}
            textAnchor="middle"
            className="fill-content-faint"
            fontSize={10}
          >
            {p.date.slice(5)}
          </text>
        ))}
    </svg>
  );
}

/* ========== Status Badge ========== */

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    running: "bg-emerald-500/10 text-emerald-400",
    active: "bg-emerald-500/10 text-emerald-400",
    paused: "bg-amber-500/10 text-amber-400",
    completed: "bg-blue-500/10 text-blue-400",
    draft: "bg-surface-inset text-content-muted",
    archived: "bg-surface-inset text-content-faint",
  };

  return (
    <span
      className={`inline-block rounded px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${
        styles[status] || styles.draft
      }`}
    >
      {status}
    </span>
  );
}

/* ========== Tab Definitions ========== */

type TabKey = "overview" | "utm" | "ab_testing" | "pixels" | "journeys";

const tabs: { key: TabKey; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "utm", label: "UTM & Sources" },
  { key: "ab_testing", label: "A/B Testing" },
  { key: "pixels", label: "Pixels & Tracking" },
  { key: "journeys", label: "User Journeys" },
];

/* ========== Main Page ========== */

export default function AdminMarketingPage() {
  const [tab, setTab] = useState<TabKey>("overview");
  const [period, setPeriod] = useState<"7d" | "30d" | "90d">("7d");
  const [loading, setLoading] = useState(true);

  // Data states
  const [stats, setStats] = useState<StatsData | null>(null);
  const [abTests, setAbTests] = useState<ABTest[]>([]);
  const [variants, setVariants] = useState<HomepageVariant[]>([]);
  const [pixels, setPixels] = useState<TrackingPixelData[]>([]);

  // Form states
  const [showNewTest, setShowNewTest] = useState(false);
  const [showNewPixel, setShowNewPixel] = useState(false);
  const [newTestName, setNewTestName] = useState("");
  const [newTestDesc, setNewTestDesc] = useState("");
  const [newPixelName, setNewPixelName] = useState("");
  const [newPixelType, setNewPixelType] = useState("google_analytics");
  const [newPixelId, setNewPixelId] = useState("");

  // ── Fetchers ──

  const fetchStats = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/marketing/stats?period=${period}`);
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [period]);

  const fetchAbTests = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/marketing/ab-tests");
      if (res.ok) {
        const data = await res.json();
        setAbTests(data.tests || []);
      }
    } catch {
      /* ignore */
    }
  }, []);

  const fetchVariants = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/marketing/homepage-variants");
      if (res.ok) {
        const data = await res.json();
        setVariants(data.variants || []);
      }
    } catch {
      /* ignore */
    }
  }, []);

  const fetchPixels = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/marketing/pixels");
      if (res.ok) {
        const data = await res.json();
        setPixels(data.pixels || []);
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (tab === "overview" || tab === "utm" || tab === "journeys") {
      fetchStats();
    }
    if (tab === "ab_testing") {
      fetchAbTests();
      fetchVariants();
    }
    if (tab === "pixels") {
      fetchPixels();
    }
  }, [tab, period, fetchStats, fetchAbTests, fetchVariants, fetchPixels]);

  // ── Actions ──

  async function createAbTest() {
    if (!newTestName.trim()) return;
    try {
      await fetch("/api/admin/marketing/ab-tests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newTestName,
          description: newTestDesc || null,
          variants: JSON.stringify([
            { id: "control", name: "Control", weight: 50 },
            { id: "variant_a", name: "Variant A", weight: 50 },
          ]),
        }),
      });
      setNewTestName("");
      setNewTestDesc("");
      setShowNewTest(false);
      fetchAbTests();
    } catch {
      /* ignore */
    }
  }

  async function updateTestStatus(id: string, status: string) {
    const test = abTests.find((t) => t.id === id);
    if (!test) return;
    try {
      await fetch("/api/admin/marketing/ab-tests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          name: test.name,
          description: test.description,
          status,
          variants: test.variants,
        }),
      });
      fetchAbTests();
    } catch {
      /* ignore */
    }
  }

  async function createPixel() {
    if (!newPixelName.trim() || !newPixelId.trim()) return;
    try {
      await fetch("/api/admin/marketing/pixels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newPixelName,
          type: newPixelType,
          pixelId: newPixelId,
        }),
      });
      setNewPixelName("");
      setNewPixelId("");
      setShowNewPixel(false);
      fetchPixels();
    } catch {
      /* ignore */
    }
  }

  async function togglePixel(id: string, enabled: boolean) {
    const px = pixels.find((p) => p.id === id);
    if (!px) return;
    try {
      await fetch("/api/admin/marketing/pixels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...px, enabled }),
      });
      fetchPixels();
    } catch {
      /* ignore */
    }
  }

  async function deletePixel(id: string) {
    try {
      await fetch(`/api/admin/marketing/pixels?id=${id}`, { method: "DELETE" });
      fetchPixels();
    } catch {
      /* ignore */
    }
  }

  // ── Derived ──

  const summary = stats?.summary;
  const deviceTotal = stats?.devices
    ? Object.values(stats.devices).reduce((s, n) => s + n, 0)
    : 0;

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-content">Marketing</h1>
          <p className="mt-1 text-sm text-content-muted">
            Website analytics, A/B testing, and conversion tracking.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Tab switcher */}
          <div className="flex rounded-lg border border-edge">
            {tabs.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`px-3.5 py-1.5 text-xs font-medium transition-colors ${
                  tab === t.key
                    ? "bg-accent-subtle-bg/10 text-accent-text"
                    : "text-content-muted hover:text-content-secondary"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          {/* Period selector (for overview/utm/journeys) */}
          {(tab === "overview" || tab === "utm" || tab === "journeys") && (
            <div className="flex rounded-lg border border-edge">
              {(["7d", "30d", "90d"] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                    period === p
                      ? "bg-accent-subtle-bg/10 text-accent-text"
                      : "text-content-muted hover:text-content-secondary"
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ═══════════════════════════════════════════
          Tab 1: Overview
          ═══════════════════════════════════════════ */}
      {tab === "overview" && (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Total Page Views"
              value={summary ? formatNum(summary.totalPageViews) : "..."}
              sub={`Last ${period}`}
              icon={icons.eye}
              accent
              loading={loading}
            />
            <StatCard
              label="Unique Sessions"
              value={summary ? formatNum(summary.uniqueSessions) : "..."}
              sub={`Last ${period}`}
              icon={icons.users}
              loading={loading}
            />
            <StatCard
              label="Avg Time on Page"
              value={summary ? `${summary.avgTimeOnPage}s` : "..."}
              sub="Estimated from events"
              icon={icons.clock}
              loading={loading}
            />
            <StatCard
              label="Bounce Rate"
              value={summary ? pct(summary.bounceRate) : "..."}
              sub="Single-page sessions"
              icon={icons.arrowTrendingDown}
              warn={summary ? summary.bounceRate > 70 : false}
              loading={loading}
            />
          </div>

          {/* Page Views Chart */}
          <div className="rounded-lg border border-edge bg-surface-card p-5">
            <h2 className="mb-4 text-sm font-semibold text-content">
              Page Views Over Time
            </h2>
            {loading ? (
              <div className="h-40 animate-pulse rounded bg-white/[0.06]" />
            ) : (
              <Sparkline data={stats?.pageViewsOverTime || []} />
            )}
          </div>

          {/* Two-column: Top Pages + Top Referrers */}
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Top Pages */}
            <div className="rounded-lg border border-edge bg-surface-card">
              <div className="border-b border-edge px-5 py-4">
                <h2 className="text-sm font-semibold text-content">Top Pages</h2>
              </div>
              {loading ? (
                <SkeletonTable />
              ) : (
                <div className="divide-y divide-edge">
                  {(stats?.topPages || []).length === 0 ? (
                    <div className="px-5 py-8 text-center text-sm text-content-faint">
                      No page view data yet.
                    </div>
                  ) : (
                    stats!.topPages.slice(0, 10).map((p) => (
                      <div
                        key={p.path}
                        className="flex items-center justify-between px-5 py-3 hover:bg-surface-card-hover"
                      >
                        <p className="truncate text-sm font-mono text-content">
                          {p.path}
                        </p>
                        <span className="ml-4 shrink-0 text-sm font-semibold tabular-nums text-content">
                          {formatNum(p.views)}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>

            {/* Top Referrers */}
            <div className="rounded-lg border border-edge bg-surface-card">
              <div className="border-b border-edge px-5 py-4">
                <h2 className="text-sm font-semibold text-content">
                  Top Referrers
                </h2>
              </div>
              {loading ? (
                <SkeletonTable />
              ) : (
                <div className="divide-y divide-edge">
                  {(stats?.topReferrers || []).length === 0 ? (
                    <div className="px-5 py-8 text-center text-sm text-content-faint">
                      No referrer data yet.
                    </div>
                  ) : (
                    stats!.topReferrers.slice(0, 10).map((r) => (
                      <div
                        key={r.referrer}
                        className="flex items-center justify-between px-5 py-3 hover:bg-surface-card-hover"
                      >
                        <p className="truncate text-sm text-content">
                          {r.referrer}
                        </p>
                        <span className="ml-4 shrink-0 text-sm font-semibold tabular-nums text-content">
                          {formatNum(r.views)}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Device Breakdown */}
          <div className="rounded-lg border border-edge bg-surface-card p-5">
            <h2 className="mb-4 text-sm font-semibold text-content">
              Device Breakdown
            </h2>
            {loading ? (
              <div className="h-8 animate-pulse rounded bg-white/[0.06]" />
            ) : deviceTotal === 0 ? (
              <p className="text-sm text-content-faint">No device data yet.</p>
            ) : (
              <div className="flex gap-3">
                {(["desktop", "mobile", "tablet"] as const).map((d) => {
                  const count = stats?.devices?.[d] || 0;
                  const devicePct = deviceTotal > 0 ? Math.round((count / deviceTotal) * 100) : 0;
                  const colors: Record<string, string> = {
                    desktop: "bg-emerald-500",
                    mobile: "bg-blue-500",
                    tablet: "bg-purple-500",
                  };
                  return (
                    <div key={d} className="flex-1">
                      <div className="mb-2 flex items-baseline justify-between">
                        <span className="text-xs font-medium capitalize text-content-secondary">
                          {d}
                        </span>
                        <span className="text-xs tabular-nums text-content-faint">
                          {count} ({devicePct}%)
                        </span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-surface-inset">
                        <div
                          className={`h-full rounded-full transition-all ${colors[d]}`}
                          style={{ width: `${devicePct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}

      {/* ═══════════════════════════════════════════
          Tab 2: UTM & Sources
          ═══════════════════════════════════════════ */}
      {tab === "utm" && (
        <>
          {/* UTM Source Breakdown */}
          <div className="rounded-lg border border-edge bg-surface-card">
            <div className="border-b border-edge px-5 py-4">
              <h2 className="text-sm font-semibold text-content">
                UTM Source Breakdown
              </h2>
            </div>
            {loading ? (
              <SkeletonTable rows={6} />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-edge">
                      <th className="px-5 py-3 text-xs font-medium uppercase tracking-wider text-content-muted">
                        Source
                      </th>
                      <th className="px-5 py-3 text-xs font-medium uppercase tracking-wider text-content-muted">
                        Page Views
                      </th>
                      <th className="px-5 py-3 text-xs font-medium uppercase tracking-wider text-content-muted">
                        Share
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-edge">
                    {(stats?.utmSources || []).length === 0 ? (
                      <tr>
                        <td colSpan={3} className="px-5 py-8 text-center text-sm text-content-faint">
                          No UTM source data yet. Add UTM parameters to your campaign URLs.
                        </td>
                      </tr>
                    ) : (
                      stats!.utmSources.map((s) => (
                        <tr key={s.source} className="hover:bg-surface-card-hover">
                          <td className="px-5 py-3 font-medium text-content">
                            {s.source}
                          </td>
                          <td className="px-5 py-3 tabular-nums text-content">
                            {formatNum(s.views)}
                          </td>
                          <td className="px-5 py-3 text-content-faint">
                            {summary && summary.totalPageViews > 0
                              ? `${Math.round((s.views / summary.totalPageViews) * 100)}%`
                              : "--"}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Conversion Funnel */}
          <div className="rounded-lg border border-edge bg-surface-card p-5">
            <h2 className="mb-4 text-sm font-semibold text-content">
              Conversion Funnel
            </h2>
            {loading ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="h-8 animate-pulse rounded bg-white/[0.06]" />
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                {[
                  { label: "Page Views", value: stats?.funnel?.pageViews || 0 },
                  { label: "Unique Sessions", value: stats?.funnel?.uniqueSessions || 0 },
                  { label: "CTA Clicks", value: stats?.funnel?.ctaClicks || 0 },
                  { label: "Form Starts", value: stats?.funnel?.formStarts || 0 },
                  { label: "Form Completes", value: stats?.funnel?.formCompletes || 0 },
                  { label: "Signups", value: stats?.funnel?.signups || 0 },
                ].map((step, i) => {
                  const maxVal = stats?.funnel?.pageViews || 1;
                  const width = Math.max((step.value / maxVal) * 100, 2);
                  return (
                    <div key={i}>
                      <div className="mb-1 flex items-baseline justify-between">
                        <span className="text-xs font-medium text-content-secondary">
                          {step.label}
                        </span>
                        <span className="text-xs tabular-nums text-content-faint">
                          {formatNum(step.value)}
                        </span>
                      </div>
                      <div className="h-6 w-full overflow-hidden rounded bg-surface-inset">
                        <div
                          className="flex h-full items-center rounded bg-accent-text/20 transition-all"
                          style={{ width: `${width}%` }}
                        >
                          <span className="px-2 text-[10px] font-medium text-accent-text">
                            {maxVal > 0 ? `${Math.round((step.value / maxVal) * 100)}%` : ""}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Referrer Analysis */}
          <div className="rounded-lg border border-edge bg-surface-card">
            <div className="border-b border-edge px-5 py-4">
              <h2 className="text-sm font-semibold text-content">
                Referrer Analysis
              </h2>
            </div>
            {loading ? (
              <SkeletonTable />
            ) : (
              <div className="divide-y divide-edge">
                {(stats?.topReferrers || []).length === 0 ? (
                  <div className="px-5 py-8 text-center text-sm text-content-faint">
                    No referrer data yet.
                  </div>
                ) : (
                  stats!.topReferrers.map((r) => {
                    let domain = r.referrer;
                    try {
                      domain = new URL(r.referrer).hostname;
                    } catch {}
                    return (
                      <div
                        key={r.referrer}
                        className="flex items-center justify-between px-5 py-3 hover:bg-surface-card-hover"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-content">
                            {domain}
                          </p>
                          <p className="truncate text-xs text-content-faint">
                            {r.referrer}
                          </p>
                        </div>
                        <span className="ml-4 shrink-0 rounded bg-accent-subtle-bg/10 px-2 py-0.5 text-xs font-medium tabular-nums text-accent-text">
                          {formatNum(r.views)} views
                        </span>
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>
        </>
      )}

      {/* ═══════════════════════════════════════════
          Tab 3: A/B Testing
          ═══════════════════════════════════════════ */}
      {tab === "ab_testing" && (
        <>
          {/* A/B Tests */}
          <div className="rounded-lg border border-edge bg-surface-card">
            <div className="flex items-center justify-between border-b border-edge px-5 py-4">
              <h2 className="text-sm font-semibold text-content">A/B Tests</h2>
              <button
                onClick={() => setShowNewTest(!showNewTest)}
                className="flex items-center gap-1.5 rounded-lg bg-accent-subtle-bg/10 px-3 py-1.5 text-xs font-medium text-accent-text transition-colors hover:bg-accent-subtle-bg/20"
              >
                {icons.plus}
                New Test
              </button>
            </div>

            {/* New Test Form */}
            {showNewTest && (
              <div className="border-b border-edge bg-surface-inset/30 px-5 py-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                  <div className="flex-1">
                    <label className="mb-1 block text-xs font-medium text-content-muted">
                      Test Name
                    </label>
                    <input
                      type="text"
                      value={newTestName}
                      onChange={(e) => setNewTestName(e.target.value)}
                      placeholder="e.g. Hero CTA color test"
                      className="w-full rounded-lg border border-edge bg-surface-card px-3 py-1.5 text-sm text-content placeholder:text-content-faint focus:border-accent/50 focus:outline-none focus:ring-1 focus:ring-accent/30"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="mb-1 block text-xs font-medium text-content-muted">
                      Description
                    </label>
                    <input
                      type="text"
                      value={newTestDesc}
                      onChange={(e) => setNewTestDesc(e.target.value)}
                      placeholder="Optional description"
                      className="w-full rounded-lg border border-edge bg-surface-card px-3 py-1.5 text-sm text-content placeholder:text-content-faint focus:border-accent/50 focus:outline-none focus:ring-1 focus:ring-accent/30"
                    />
                  </div>
                  <button
                    onClick={createAbTest}
                    disabled={!newTestName.trim()}
                    className="rounded-lg bg-accent-text px-4 py-1.5 text-xs font-medium text-white transition-colors hover:bg-accent-text/90 disabled:opacity-50"
                  >
                    Create
                  </button>
                </div>
              </div>
            )}

            {/* Tests List */}
            <div className="divide-y divide-edge">
              {abTests.length === 0 ? (
                <div className="px-5 py-8 text-center text-sm text-content-faint">
                  No A/B tests yet. Create one to start optimizing.
                </div>
              ) : (
                abTests.map((test) => (
                  <div key={test.id} className="px-5 py-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold text-content">
                            {test.name}
                          </p>
                          <StatusBadge status={test.status} />
                        </div>
                        {test.description && (
                          <p className="mt-1 text-xs text-content-faint">
                            {test.description}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {test.status === "draft" && (
                          <button
                            onClick={() => updateTestStatus(test.id, "running")}
                            className="rounded bg-emerald-500/10 px-2 py-1 text-[10px] font-medium text-emerald-400 hover:bg-emerald-500/20"
                          >
                            Start
                          </button>
                        )}
                        {test.status === "running" && (
                          <>
                            <button
                              onClick={() => updateTestStatus(test.id, "paused")}
                              className="rounded bg-amber-500/10 px-2 py-1 text-[10px] font-medium text-amber-400 hover:bg-amber-500/20"
                            >
                              Pause
                            </button>
                            <button
                              onClick={() => updateTestStatus(test.id, "completed")}
                              className="rounded bg-blue-500/10 px-2 py-1 text-[10px] font-medium text-blue-400 hover:bg-blue-500/20"
                            >
                              Complete
                            </button>
                          </>
                        )}
                        {test.status === "paused" && (
                          <button
                            onClick={() => updateTestStatus(test.id, "running")}
                            className="rounded bg-emerald-500/10 px-2 py-1 text-[10px] font-medium text-emerald-400 hover:bg-emerald-500/20"
                          >
                            Resume
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Variant Performance */}
                    {test.variantPerformance && test.variantPerformance.length > 0 && (
                      <div className="mt-3 overflow-x-auto">
                        <table className="w-full text-left text-xs">
                          <thead>
                            <tr className="border-b border-edge/50">
                              <th className="pb-2 pr-4 font-medium text-content-muted">
                                Variant
                              </th>
                              <th className="pb-2 pr-4 font-medium text-content-muted">
                                Views
                              </th>
                              <th className="pb-2 pr-4 font-medium text-content-muted">
                                Conversions
                              </th>
                              <th className="pb-2 font-medium text-content-muted">
                                Conv. Rate
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-edge/30">
                            {test.variantPerformance.map((v) => (
                              <tr key={v.id}>
                                <td className="py-2 pr-4 font-medium text-content">
                                  {v.name}
                                </td>
                                <td className="py-2 pr-4 tabular-nums text-content">
                                  {formatNum(v.views)}
                                </td>
                                <td className="py-2 pr-4 tabular-nums text-content">
                                  {formatNum(v.conversions)}
                                </td>
                                <td className="py-2">
                                  <span
                                    className={`rounded px-1.5 py-0.5 font-medium tabular-nums ${
                                      v.conversionRate > 0
                                        ? "bg-emerald-500/10 text-emerald-400"
                                        : "bg-surface-inset text-content-faint"
                                    }`}
                                  >
                                    {v.conversionRate}%
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Homepage Variants */}
          <div className="rounded-lg border border-edge bg-surface-card">
            <div className="border-b border-edge px-5 py-4">
              <h2 className="text-sm font-semibold text-content">
                Homepage Variants
              </h2>
            </div>
            <div className="divide-y divide-edge">
              {variants.length === 0 ? (
                <div className="px-5 py-8 text-center text-sm text-content-faint">
                  No homepage variants configured.
                </div>
              ) : (
                variants.map((v) => (
                  <div
                    key={v.id}
                    className="flex items-center justify-between px-5 py-3 hover:bg-surface-card-hover"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-content">
                          {v.name}
                        </p>
                        <StatusBadge status={v.status} />
                        {v.isDefault && (
                          <span className="rounded bg-blue-500/10 px-1.5 py-0.5 text-[10px] font-medium text-blue-400">
                            default
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-xs text-content-faint">
                        /{v.slug}
                        {v.heroTitle ? ` — "${v.heroTitle.slice(0, 60)}"` : ""}
                      </p>
                    </div>
                    <span className="ml-4 font-mono text-xs text-content-faint">
                      {v.slug}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}

      {/* ═══════════════════════════════════════════
          Tab 4: Pixels & Tracking
          ═══════════════════════════════════════════ */}
      {tab === "pixels" && (
        <>
          <div className="rounded-lg border border-edge bg-surface-card">
            <div className="flex items-center justify-between border-b border-edge px-5 py-4">
              <h2 className="text-sm font-semibold text-content">
                Tracking Pixels
              </h2>
              <button
                onClick={() => setShowNewPixel(!showNewPixel)}
                className="flex items-center gap-1.5 rounded-lg bg-accent-subtle-bg/10 px-3 py-1.5 text-xs font-medium text-accent-text transition-colors hover:bg-accent-subtle-bg/20"
              >
                {icons.plus}
                Add Pixel
              </button>
            </div>

            {/* New Pixel Form */}
            {showNewPixel && (
              <div className="border-b border-edge bg-surface-inset/30 px-5 py-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                  <div className="flex-1">
                    <label className="mb-1 block text-xs font-medium text-content-muted">
                      Name
                    </label>
                    <input
                      type="text"
                      value={newPixelName}
                      onChange={(e) => setNewPixelName(e.target.value)}
                      placeholder="e.g. Facebook Pixel"
                      className="w-full rounded-lg border border-edge bg-surface-card px-3 py-1.5 text-sm text-content placeholder:text-content-faint focus:border-accent/50 focus:outline-none focus:ring-1 focus:ring-accent/30"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-content-muted">
                      Type
                    </label>
                    <select
                      value={newPixelType}
                      onChange={(e) => setNewPixelType(e.target.value)}
                      className="rounded-lg border border-edge bg-surface-card px-3 py-1.5 text-sm text-content focus:border-accent/50 focus:outline-none focus:ring-1 focus:ring-accent/30"
                    >
                      <option value="google_analytics">Google Analytics</option>
                      <option value="google_ads">Google Ads</option>
                      <option value="facebook">Facebook</option>
                      <option value="taboola">Taboola</option>
                      <option value="custom">Custom</option>
                    </select>
                  </div>
                  <div className="flex-1">
                    <label className="mb-1 block text-xs font-medium text-content-muted">
                      Pixel ID
                    </label>
                    <input
                      type="text"
                      value={newPixelId}
                      onChange={(e) => setNewPixelId(e.target.value)}
                      placeholder="e.g. G-XXXXXXXXXX"
                      className="w-full rounded-lg border border-edge bg-surface-card px-3 py-1.5 text-sm text-content placeholder:text-content-faint focus:border-accent/50 focus:outline-none focus:ring-1 focus:ring-accent/30"
                    />
                  </div>
                  <button
                    onClick={createPixel}
                    disabled={!newPixelName.trim() || !newPixelId.trim()}
                    className="rounded-lg bg-accent-text px-4 py-1.5 text-xs font-medium text-white transition-colors hover:bg-accent-text/90 disabled:opacity-50"
                  >
                    Add
                  </button>
                </div>
              </div>
            )}

            {/* Pixels List */}
            <div className="divide-y divide-edge">
              {pixels.length === 0 ? (
                <div className="px-5 py-8 text-center text-sm text-content-faint">
                  No tracking pixels configured yet.
                </div>
              ) : (
                pixels.map((px) => (
                  <div
                    key={px.id}
                    className="flex items-center justify-between px-5 py-3 hover:bg-surface-card-hover"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-content">
                          {px.name}
                        </p>
                        <span className="rounded bg-surface-inset px-1.5 py-0.5 text-[10px] font-medium text-content-muted">
                          {px.type}
                        </span>
                      </div>
                      <p className="mt-0.5 font-mono text-xs text-content-faint">
                        {px.pixelId}
                      </p>
                    </div>
                    <div className="ml-4 flex items-center gap-3">
                      {/* Toggle */}
                      <button
                        onClick={() => togglePixel(px.id, !px.enabled)}
                        className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors ${
                          px.enabled ? "bg-emerald-500" : "bg-surface-inset"
                        }`}
                      >
                        <span
                          className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${
                            px.enabled ? "translate-x-[18px]" : "translate-x-[3px]"
                          }`}
                        />
                      </button>
                      {/* Delete */}
                      <button
                        onClick={() => deletePixel(px.id)}
                        className="text-content-faint transition-colors hover:text-red-400"
                      >
                        {icons.trash}
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}

      {/* ═══════════════════════════════════════════
          Tab 5: User Journeys
          ═══════════════════════════════════════════ */}
      {tab === "journeys" && (
        <>
          {/* Top Journeys */}
          <div className="rounded-lg border border-edge bg-surface-card">
            <div className="border-b border-edge px-5 py-4">
              <h2 className="text-sm font-semibold text-content">
                Top 10 Page Sequences
              </h2>
            </div>
            {loading ? (
              <SkeletonTable rows={6} />
            ) : (
              <div className="divide-y divide-edge">
                {(stats?.topJourneys || []).length === 0 ? (
                  <div className="px-5 py-8 text-center text-sm text-content-faint">
                    No journey data yet. Journeys are computed from page view sequences.
                  </div>
                ) : (
                  stats!.topJourneys.map((j, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between px-5 py-3 hover:bg-surface-card-hover"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1">
                          {j.journey.split(" → ").map((step, si) => (
                            <span key={si} className="flex items-center gap-1">
                              {si > 0 && (
                                <svg className="h-3 w-3 shrink-0 text-content-faint" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                                </svg>
                              )}
                              <span className="rounded bg-surface-inset px-2 py-0.5 font-mono text-xs text-content">
                                {step}
                              </span>
                            </span>
                          ))}
                        </div>
                      </div>
                      <span className="ml-4 shrink-0 rounded bg-accent-subtle-bg/10 px-2 py-0.5 text-xs font-medium tabular-nums text-accent-text">
                        {formatNum(j.count)} sessions
                      </span>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Drop-off Analysis */}
          <div className="rounded-lg border border-edge bg-surface-card">
            <div className="border-b border-edge px-5 py-4">
              <h2 className="text-sm font-semibold text-content">
                Drop-off Analysis
              </h2>
              <p className="mt-0.5 text-xs text-content-faint">
                Pages with the highest exit rates
              </p>
            </div>
            {loading ? (
              <SkeletonTable rows={6} />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-edge">
                      <th className="px-5 py-3 text-xs font-medium uppercase tracking-wider text-content-muted">
                        Page
                      </th>
                      <th className="px-5 py-3 text-xs font-medium uppercase tracking-wider text-content-muted">
                        Exits
                      </th>
                      <th className="px-5 py-3 text-xs font-medium uppercase tracking-wider text-content-muted">
                        Exit Rate
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-edge">
                    {(stats?.dropOffs || []).length === 0 ? (
                      <tr>
                        <td colSpan={3} className="px-5 py-8 text-center text-sm text-content-faint">
                          No exit data yet.
                        </td>
                      </tr>
                    ) : (
                      stats!.dropOffs.map((d) => (
                        <tr key={d.path} className="hover:bg-surface-card-hover">
                          <td className="px-5 py-3 font-mono text-xs text-content">
                            {d.path}
                          </td>
                          <td className="px-5 py-3 tabular-nums text-content">
                            {formatNum(d.exits)}
                          </td>
                          <td className="px-5 py-3">
                            <span
                              className={`rounded px-2 py-0.5 text-xs font-medium tabular-nums ${
                                d.exitRate > 50
                                  ? "bg-red-500/10 text-red-400"
                                  : d.exitRate > 30
                                    ? "bg-amber-500/10 text-amber-400"
                                    : "bg-emerald-500/10 text-emerald-400"
                              }`}
                            >
                              {d.exitRate}%
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* Empty state — shown only on overview when no data at all */}
      {tab === "overview" && !loading && stats && stats.summary.totalPageViews === 0 && (
        <div className="rounded-lg border border-dashed border-edge px-6 py-12 text-center">
          <p className="text-sm text-content-faint">
            No marketing analytics data yet. Page views will appear here once
            the tracking script is active on your marketing pages.
          </p>
        </div>
      )}
    </div>
  );
}
