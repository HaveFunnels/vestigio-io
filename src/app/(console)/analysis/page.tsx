"use client";

import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import toast from "react-hot-toast";
import DataTable, { Column } from "@/components/console/DataTable";
import SideDrawer from "@/components/console/SideDrawer";
import SeverityBadge from "@/components/console/SeverityBadge";
import VerificationBadge from "@/components/console/VerificationBadge";
import ChangeBadge from "@/components/console/ChangeBadge";
import SummaryCards, { SummaryCard } from "@/components/console/SummaryCards";
import ImpactBadge from "@/components/console/ImpactBadge";
import ConsoleState from "@/components/console/ConsoleState";
import VerificationPanel from "@/components/console/VerificationPanel";
import VerificationSufficiencyWarning from "@/components/console/VerificationSufficiencyWarning";
import { loadFindings } from "@/lib/console-data";
import { useMcpData } from "@/components/app/McpDataProvider";
import { ShinyButton } from "@/components/ui/shiny-button";
import type { FindingProjection } from "../../../../packages/projections";

// ──────────────────────────────────────────────
// Analysis Page — Live Progressive Analysis
//
// - SSE stream for real-time updates
// - Step timeline with human-language messages
// - Progressive finding delivery
// - Polarity filtering (negative/positive/neutral)
// ──────────────────────────────────────────────

type AnalysisState = "idle" | "ongoing" | "complete";
type SeverityFilter = "all" | "critical" | "high" | "medium" | "low";
type PackFilter = "all" | "scale_readiness" | "revenue_integrity" | "chargeback_resilience" | "saas_growth_readiness";
type PolarityFilter = "all" | "negative" | "positive" | "neutral";
type VerificationFilter = "all" | "unverified" | "verified" | "challenged";
type ImpactRangeFilter = "all" | "lt1k" | "1k_10k" | "10k_50k" | "gt50k";
type ChangeClassFilter = "all" | "new_issue" | "regression" | "improvement" | "stable_risk" | "resolved";
type ConfidenceFilter = "all" | "gt80" | "50_80" | "lt50";

const severityValues: SeverityFilter[] = ["all", "critical", "high", "medium", "low"];
const packValues: PackFilter[] = ["all", "scale_readiness", "revenue_integrity", "chargeback_resilience", "saas_growth_readiness"];
const polarityValues: PolarityFilter[] = ["all", "negative", "positive", "neutral"];
const verificationValues: VerificationFilter[] = ["all", "unverified", "verified", "challenged"];
const impactRangeValues: ImpactRangeFilter[] = ["all", "lt1k", "1k_10k", "10k_50k", "gt50k"];
const changeClassValues: ChangeClassFilter[] = ["all", "new_issue", "regression", "improvement", "stable_risk", "resolved"];
const confidenceValues: ConfidenceFilter[] = ["all", "gt80", "50_80", "lt50"];

const polarityIcons: Record<string, string> = {
  negative: "!",
  positive: "\u2713",
  neutral: "\u2022",
};

const polarityColors: Record<string, string> = {
  negative: "dark:text-red-400 text-red-600",
  positive: "dark:text-emerald-400 text-emerald-600",
  neutral: "text-content-muted",
};

export default function AnalysisPage() {
  const t = useTranslations("console.analysis");
  const [analysisState, setAnalysisState] = useState<AnalysisState>("idle");
  const [currentStep, setCurrentStep] = useState<string | null>(null);
  const [findings, setFindings] = useState<FindingProjection[]>([]);
  const [stepHistory, setStepHistory] = useState<string[]>([]);
  const [coverageScore, setCoverageScore] = useState<number>(0);
  const [totalImpact, setTotalImpact] = useState<number>(0);
  const [challengeInfo, setChallengeInfo] = useState<{ type: string; url: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Try pre-loaded data from server layout, fall back to direct MCP call
  const mcpData = useMcpData();
  const existingState = mcpData.findings.status !== "not_ready" ? mcpData.findings : loadFindings();
  const hasExistingData = existingState.status === "ready" && existingState.data.length > 0;

  useEffect(() => {
    if (hasExistingData && existingState.status === "ready") {
      setFindings(existingState.data);
      setAnalysisState("complete");
    }
  }, [hasExistingData]);

  const startAnalysis = useCallback((domain: string) => {
    setAnalysisState("ongoing");
    setFindings([]);
    setStepHistory([]);
    setError(null);

    const params = new URLSearchParams({ domain });
    const evtSource = new EventSource(`/api/analysis/stream?${params}`);

    evtSource.addEventListener("step", (e) => {
      const data = JSON.parse(e.data);
      setCurrentStep(data.message);
      setStepHistory(prev => [...prev.slice(-6), data.message]);
    });

    evtSource.addEventListener("findings", (e) => {
      const data = JSON.parse(e.data);
      setFindings(data.findings);
    });

    evtSource.addEventListener("score", (e) => {
      const data = JSON.parse(e.data);
      setTotalImpact(data.total_impact_mid);
      setCoverageScore(data.coverage?.score || 0);
    });

    evtSource.addEventListener("challenge_detected", (e) => {
      const data = JSON.parse(e.data);
      setChallengeInfo({ type: data.challenge_type, url: data.url });
    });

    evtSource.addEventListener("coverage_update", (e) => {
      const data = JSON.parse(e.data);
      setCoverageScore(data.score || 0);
    });

    evtSource.addEventListener("complete", () => {
      setAnalysisState("complete");
      evtSource.close();
    });

    evtSource.addEventListener("error", (e) => {
      try {
        const data = JSON.parse((e as any).data);
        setError(data.message);
      } catch {
        setError(t("connection_lost"));
      }
      setAnalysisState("complete");
      evtSource.close();
    });

    evtSource.onerror = () => {
      setAnalysisState("complete");
      evtSource.close();
    };
  }, [t]);

  // If no existing data and idle, show prompt or auto-start
  if (analysisState === "idle" && !hasExistingData) {
    if (existingState.status === "not_ready") {
      return (
        <div className="p-6">
          <ConsoleState state={existingState} loadingLabel="" emptyLabel="">
            {() => null}
          </ConsoleState>
        </div>
      );
    }
    // Show empty state with existing ConsoleState handling
    return (
      <div className="p-6">
        <ConsoleState state={existingState} loadingLabel={t("loading")} emptyLabel={t("empty")}>
          {(data) => <AnalysisContent findings={data} analysisState="complete" currentStep={null} stepHistory={[]} coverageScore={100} challengeInfo={null} />}
        </ConsoleState>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-content">{t("title")}</h1>
        <p className="mt-1 text-sm text-content-muted">
          {analysisState === "ongoing"
            ? t("subtitle_ongoing")
            : t("subtitle_complete")}
        </p>
      </div>

      {/* Step Timeline (during ongoing analysis) */}
      {analysisState === "ongoing" && currentStep && (
        <div className="mb-6 rounded-lg border border-edge bg-surface-card p-4">
          <div className="flex items-center gap-3">
            <div className="h-3 w-3 animate-pulse rounded-full bg-emerald-500" />
            <span className="text-sm font-medium text-content-secondary">{currentStep}</span>
          </div>
          {stepHistory.length > 1 && (
            <div className="mt-3 space-y-1">
              {stepHistory.slice(0, -1).map((step, i) => (
                <div key={i} className="flex items-center gap-3 pl-1">
                  <div className="h-1.5 w-1.5 rounded-full bg-surface-inset" />
                  <span className="text-xs text-content-faint">{step}</span>
                </div>
              ))}
            </div>
          )}
          {coverageScore > 0 && (
            <div className="mt-3 flex items-center gap-2">
              <div className="h-1.5 flex-1 rounded-full bg-surface-inset">
                <div className="h-1.5 rounded-full bg-emerald-600 transition-all duration-500" style={{ width: `${coverageScore}%` }} />
              </div>
              <span className="text-xs text-content-muted">{t("coverage", { score: coverageScore })}</span>
            </div>
          )}
        </div>
      )}

      {/* Challenge Warning */}
      {challengeInfo && (
        <div className="mb-4 rounded-lg border border-amber-900/50 bg-amber-500/5 px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="text-amber-500">&#9888;</span>
            <span className="text-sm font-medium dark:text-amber-300 text-amber-600">{t("protection_detected", { type: challengeInfo.type })}</span>
          </div>
          <p className="mt-1 text-xs dark:text-amber-400/70 text-amber-600/70">
            {t("protection_description", { url: challengeInfo.url })}
          </p>
        </div>
      )}

      {error && (
        <div className="mb-4 rounded-lg border border-red-900/50 bg-red-500/10 px-4 py-3 text-sm dark:text-red-400 text-red-600">
          {error}
        </div>
      )}

      {/* Skeleton during loading */}
      {analysisState === "ongoing" && findings.length === 0 && (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="flex items-center gap-4 rounded-lg border border-edge bg-surface-card/30 p-4">
              <div className="h-4 w-4 animate-pulse rounded bg-surface-inset" />
              <div className="flex-1 space-y-2">
                <div className="h-3 w-3/4 animate-pulse rounded bg-surface-inset" />
                <div className="h-2 w-1/2 animate-pulse rounded bg-surface-inset" />
              </div>
              <div className="h-6 w-16 animate-pulse rounded bg-surface-inset" />
            </div>
          ))}
        </div>
      )}

      {/* Real findings content */}
      {findings.length > 0 && (
        <AnalysisContent
          findings={findings}
          analysisState={analysisState}
          currentStep={currentStep}
          stepHistory={stepHistory}
          coverageScore={coverageScore}
          challengeInfo={challengeInfo}
        />
      )}
    </div>
  );
}

// ──────────────────────────────────────────────
// Content (renders incrementally)
// ──────────────────────────────────────────────

function AnalysisContent({
  findings,
  analysisState,
  currentStep,
  stepHistory,
  coverageScore,
  challengeInfo,
}: {
  findings: FindingProjection[];
  analysisState: AnalysisState;
  currentStep: string | null;
  stepHistory: string[];
  coverageScore: number;
  challengeInfo: { type: string; url: string } | null;
}) {
  const router = useRouter();
  const t = useTranslations("console.analysis");
  const tc = useTranslations("console.common");
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>("all");
  const [packFilter, setPackFilter] = useState<PackFilter>("all");
  const [polarityFilter, setPolarityFilter] = useState<PolarityFilter>("all");
  const [verificationFilter, setVerificationFilter] = useState<VerificationFilter>("all");
  const [impactRangeFilter, setImpactRangeFilter] = useState<ImpactRangeFilter>("all");
  const [surfaceFilter, setSurfaceFilter] = useState<string>("all");
  const [changeClassFilter, setChangeClassFilter] = useState<ChangeClassFilter>("all");
  const [confidenceFilter, setConfidenceFilter] = useState<ConfidenceFilter>("all");
  const [searchText, setSearchText] = useState("");
  const [hidePositive, setHidePositive] = useState(false);
  const [selectedFinding, setSelectedFinding] = useState<FindingProjection | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const severityLabels: Record<SeverityFilter, string> = {
    all: tc("severity.all"),
    critical: tc("severity.critical"),
    high: tc("severity.high"),
    medium: tc("severity.medium"),
    low: tc("severity.low"),
  };

  const packOptionLabels: Record<PackFilter, string> = {
    all: tc("packs.all"),
    scale_readiness: tc("packs.scale_readiness"),
    revenue_integrity: tc("packs.revenue_integrity"),
    chargeback_resilience: tc("packs.chargeback_resilience"),
    saas_growth_readiness: tc("packs.saas_growth_readiness"),
  };

  const polarityLabels: Record<PolarityFilter, string> = {
    all: tc("polarity.all"),
    negative: tc("polarity.negative"),
    positive: tc("polarity.positive"),
    neutral: tc("polarity.neutral"),
  };

  const verificationLabels: Record<VerificationFilter, string> = {
    all: t("filters.verification.all"),
    unverified: t("filters.verification.unverified"),
    verified: t("filters.verification.verified"),
    challenged: t("filters.verification.challenged"),
  };

  const impactRangeLabels: Record<ImpactRangeFilter, string> = {
    all: t("filters.impact_range.all"),
    lt1k: t("filters.impact_range.lt1k"),
    "1k_10k": t("filters.impact_range.1k_10k"),
    "10k_50k": t("filters.impact_range.10k_50k"),
    gt50k: t("filters.impact_range.gt50k"),
  };

  const changeClassLabels: Record<ChangeClassFilter, string> = {
    all: t("filters.change_class.all"),
    new_issue: t("filters.change_class.new_issue"),
    regression: t("filters.change_class.regression"),
    improvement: t("filters.change_class.improvement"),
    stable_risk: t("filters.change_class.stable_risk"),
    resolved: t("filters.change_class.resolved"),
  };

  const confidenceLabels: Record<ConfidenceFilter, string> = {
    all: t("filters.confidence.all"),
    gt80: t("filters.confidence.gt80"),
    "50_80": t("filters.confidence.50_80"),
    lt50: t("filters.confidence.lt50"),
  };

  const packLabels: Record<string, string> = {
    scale_readiness: tc("pack_labels.scale_readiness"),
    revenue_integrity: tc("pack_labels.revenue_integrity"),
    chargeback_resilience: tc("pack_labels.chargeback_resilience"),
    saas_growth_readiness: tc("pack_labels.saas_growth_readiness"),
  };

  const impactTypeLabels: Record<string, string> = {
    revenue_loss: tc("impact_types.revenue_loss"),
    conversion_loss: tc("impact_types.conversion_loss"),
    chargeback_risk: tc("impact_types.chargeback_risk"),
    traffic_waste: tc("impact_types.traffic_waste"),
    lifetime_value_loss: tc("impact_types.lifetime_value_loss"),
    none: tc("impact_types.none"),
  };

  const surfaceOptions = useMemo(() => {
    const unique = Array.from(new Set(findings.map(f => f.surface).filter(Boolean))).sort();
    return [{ label: t("filters.surfaces.all"), value: "all" }, ...unique.map(s => ({ label: s!, value: s! }))];
  }, [findings, t]);

  const filtered = useMemo(() => {
    return findings.filter((f) => {
      // Phase 0 UX: Hide suppressed findings with 'hidden' visibility
      if (f.suppression_context?.visibility === 'hidden') return false;
      if (severityFilter !== "all" && f.severity !== severityFilter) return false;
      if (packFilter !== "all" && f.pack !== packFilter) return false;
      if (polarityFilter !== "all" && f.polarity !== polarityFilter) return false;
      if (hidePositive && f.polarity === "positive") return false;
      if (verificationFilter !== "all") {
        if (verificationFilter === "unverified" && f.verification_maturity !== "unverified" && f.verification_maturity !== null) return false;
        if (verificationFilter === "verified" && f.verification_maturity !== "verified") return false;
        if (verificationFilter === "challenged" && f.verification_maturity !== "degraded" && f.verification_maturity !== "stale") return false;
      }
      if (impactRangeFilter !== "all") {
        const mid = f.impact.midpoint;
        if (impactRangeFilter === "lt1k" && mid >= 1000) return false;
        if (impactRangeFilter === "1k_10k" && (mid < 1000 || mid >= 10000)) return false;
        if (impactRangeFilter === "10k_50k" && (mid < 10000 || mid >= 50000)) return false;
        if (impactRangeFilter === "gt50k" && mid < 50000) return false;
      }
      if (surfaceFilter !== "all" && f.surface !== surfaceFilter) return false;
      if (changeClassFilter !== "all" && f.change_class !== changeClassFilter) return false;
      if (confidenceFilter !== "all") {
        if (confidenceFilter === "gt80" && f.confidence <= 80) return false;
        if (confidenceFilter === "50_80" && (f.confidence < 50 || f.confidence > 80)) return false;
        if (confidenceFilter === "lt50" && f.confidence >= 50) return false;
      }
      if (searchText) {
        const q = searchText.toLowerCase();
        if (!(f.title?.toLowerCase().includes(q) || f.root_cause?.toLowerCase().includes(q))) return false;
      }
      return true;
    });
  }, [findings, severityFilter, packFilter, polarityFilter, hidePositive, verificationFilter, impactRangeFilter, surfaceFilter, changeClassFilter, confidenceFilter, searchText]);

  const summaryCards: SummaryCard[] = useMemo(() => {
    const negativeFindings = findings.filter(f => f.polarity === "negative");
    const positiveFindings = findings.filter(f => f.polarity === "positive");
    const totalImpactMid = negativeFindings.reduce((sum, f) => sum + f.impact.midpoint, 0);
    const highImpact = negativeFindings.filter(f => f.impact.midpoint >= 10000).length;
    const avgConf = negativeFindings.length
      ? Math.round(negativeFindings.reduce((sum, f) => sum + f.confidence, 0) / negativeFindings.length)
      : 0;
    return [
      {
        label: t("cards.findings"),
        value: t("cards.findings_value", { issues: negativeFindings.length, strengths: positiveFindings.length }),
        subtext: analysisState === "ongoing" ? t("updating") : undefined,
      },
      {
        label: t("cards.est_monthly_impact"),
        value: totalImpactMid >= 1000 ? `$${(totalImpactMid / 1000).toFixed(1)}k` : `$${totalImpactMid}`,
        variant: totalImpactMid >= 20000 ? "danger" : totalImpactMid >= 5000 ? "warning" : "success",
        subtext: t("cards.per_month_midpoint"),
      },
      { label: t("cards.high_impact_issues"), value: highImpact, variant: highImpact > 0 ? "danger" : "success", subtext: t("cards.high_impact_threshold") },
      { label: t("cards.avg_confidence"), value: `${avgConf}%`, variant: "default" },
    ];
  }, [findings, analysisState, t]);

  const toggleSelect = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const columns: Column<FindingProjection>[] = [
    {
      key: "select", label: "", className: "w-8",
      render: (row) => (
        <input type="checkbox" checked={selectedIds.has(row.id)} onChange={() => {}}
          onClick={(e) => toggleSelect(row.id, e)}
          className="h-3.5 w-3.5 cursor-pointer rounded border-edge bg-surface-inset text-emerald-500 focus:ring-0" />
      ),
    },
    {
      key: "polarity", label: "", className: "w-6",
      render: (row) => (
        <span className={`text-xs font-bold ${polarityColors[row.polarity]}`}>
          {polarityIcons[row.polarity]}
        </span>
      ),
    },
    {
      key: "title", label: tc("columns.finding"),
      render: (row) => {
        const isDimmed = row.suppression_context?.visibility === 'dimmed';
        const isAnnotated = row.suppression_context?.visibility === 'annotated';
        return (
          <div className={isDimmed ? 'opacity-50' : ''}>
            <div className="flex items-center gap-2">
              <span className={`text-sm ${row.polarity === 'positive' ? 'dark:text-emerald-300 text-emerald-600' : 'text-content-secondary'}`}>{row.title}</span>
              {isAnnotated && (
                <span className="rounded border border-amber-500/20 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium dark:text-amber-400 text-amber-600">
                  {t("suppressed")}
                </span>
              )}
            </div>
            {row.root_cause && <div className="mt-0.5 text-xs text-content-muted">{row.root_cause}</div>}
          </div>
        );
      },
    },
    {
      key: "severity", label: tc("columns.severity"), className: "w-24",
      render: (row) => row.polarity === 'positive'
        ? <span className="rounded bg-emerald-500/10 px-2 py-0.5 text-xs dark:text-emerald-400 text-emerald-600">{tc("healthy")}</span>
        : <SeverityBadge value={row.severity} />,
    },
    {
      key: "verification", label: t("filters.verification.label"), className: "w-24",
      render: (row) => <VerificationBadge value={row.verification_maturity} />,
    },
    {
      key: "change", label: t("filters.change_class.label"), className: "w-28",
      render: (row) => <ChangeBadge value={row.change_class} />,
    },
    { key: "confidence", label: tc("columns.confidence"), className: "w-16", render: (row) => <span className="font-mono text-xs text-content-muted">{row.confidence}%</span> },
    {
      key: "impact", label: tc("columns.est_impact"), className: "w-44",
      render: (row) => row.polarity === 'positive'
        ? <span className="text-xs text-content-muted">{"\u2014"}</span>
        : <ImpactBadge min={row.impact.monthly_range.min} max={row.impact.monthly_range.max} />,
    },
    { key: "impact_type", label: tc("columns.type"), className: "w-28", render: (row) => <span className="text-xs text-content-muted">{impactTypeLabels[row.impact.impact_type] || row.impact.impact_type}</span> },
    { key: "pack", label: tc("columns.pack"), className: "w-20", render: (row) => <span className="rounded border border-edge px-2 py-0.5 text-xs text-content-muted">{packLabels[row.pack] || row.pack}</span> },
    {
      key: "discuss", label: "", className: "w-20",
      render: (row) => row.polarity !== 'positive' ? (
        <button onClick={(e) => { e.stopPropagation(); router.push(`/chat?finding=${row.id}`); }}
          className="rounded border border-edge px-2 py-1 text-xs text-content-muted transition-colors hover:border-emerald-600 hover:text-emerald-400">
          {t("discuss")}
        </button>
      ) : null,
    },
  ];

  return (
    <>
      <div className="mb-6"><SummaryCards cards={summaryCards} /></div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <select value={polarityFilter} onChange={(e) => setPolarityFilter(e.target.value as PolarityFilter)}
          className="rounded-md border border-edge bg-surface-card px-2 py-1.5 text-xs text-content-secondary whitespace-nowrap focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600">
          {polarityValues.map((v) => <option key={v} value={v}>{polarityLabels[v]}</option>)}
        </select>
        <select value={severityFilter} onChange={(e) => setSeverityFilter(e.target.value as SeverityFilter)}
          className="rounded-md border border-edge bg-surface-card px-2 py-1.5 text-xs text-content-secondary whitespace-nowrap focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600">
          {severityValues.map((v) => <option key={v} value={v}>{severityLabels[v]}</option>)}
        </select>
        <select value={packFilter} onChange={(e) => setPackFilter(e.target.value as PackFilter)}
          className="rounded-md border border-edge bg-surface-card px-2 py-1.5 text-xs text-content-secondary whitespace-nowrap focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600">
          {packValues.map((v) => <option key={v} value={v}>{packOptionLabels[v]}</option>)}
        </select>
        <select value={verificationFilter} onChange={(e) => setVerificationFilter(e.target.value as VerificationFilter)}
          className="rounded-md border border-edge bg-surface-card px-2 py-1.5 text-xs text-content-secondary whitespace-nowrap focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600">
          {verificationValues.map((v) => <option key={v} value={v}>{verificationLabels[v]}</option>)}
        </select>
        <select value={changeClassFilter} onChange={(e) => setChangeClassFilter(e.target.value as ChangeClassFilter)}
          className="rounded-md border border-edge bg-surface-card px-2 py-1.5 text-xs text-content-secondary whitespace-nowrap focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600">
          {changeClassValues.map((v) => <option key={v} value={v}>{changeClassLabels[v]}</option>)}
        </select>
        <select value={impactRangeFilter} onChange={(e) => setImpactRangeFilter(e.target.value as ImpactRangeFilter)}
          className="rounded-md border border-edge bg-surface-card px-2 py-1.5 text-xs text-content-secondary whitespace-nowrap focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600">
          {impactRangeValues.map((v) => <option key={v} value={v}>{impactRangeLabels[v]}</option>)}
        </select>
        <select value={surfaceFilter} onChange={(e) => setSurfaceFilter(e.target.value)}
          className="rounded-md border border-edge bg-surface-card px-2 py-1.5 text-xs text-content-secondary whitespace-nowrap focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600">
          {surfaceOptions.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
        </select>
        <select value={confidenceFilter} onChange={(e) => setConfidenceFilter(e.target.value as ConfidenceFilter)}
          className="rounded-md border border-edge bg-surface-card px-2 py-1.5 text-xs text-content-secondary whitespace-nowrap focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600">
          {confidenceValues.map((v) => <option key={v} value={v}>{confidenceLabels[v]}</option>)}
        </select>
        <input type="text" value={searchText} onChange={(e) => setSearchText(e.target.value)} placeholder={t("search_placeholder")}
          className="rounded-md border border-edge bg-surface-card px-2 py-1.5 text-xs text-content-secondary whitespace-nowrap focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600" />

        <label className="flex items-center gap-1.5 text-xs text-content-muted cursor-pointer">
          <input type="checkbox" checked={hidePositive} onChange={(e) => setHidePositive(e.target.checked)}
            className="h-3 w-3 rounded border-edge bg-surface-inset text-emerald-500 focus:ring-0" />
          {tc("hide_positive_signals")}
        </label>

        {(severityFilter !== "all" || packFilter !== "all" || polarityFilter !== "all" || verificationFilter !== "all" || impactRangeFilter !== "all" || surfaceFilter !== "all" || changeClassFilter !== "all" || confidenceFilter !== "all" || searchText !== "") && (
          <button onClick={() => { setSeverityFilter("all"); setPackFilter("all"); setPolarityFilter("all"); setVerificationFilter("all"); setImpactRangeFilter("all"); setSurfaceFilter("all"); setChangeClassFilter("all"); setConfidenceFilter("all"); setSearchText(""); }}
            className="rounded-md px-3 py-1.5 text-xs text-content-muted transition-colors hover:text-content-secondary">{tc("clear_filters")}</button>
        )}
        <span className="ml-auto text-xs text-content-muted">{tc("n_of_total", { filtered: filtered.length, total: findings.length })}</span>
      </div>

      {/* Selection bar — matches inventory pattern */}
      {selectedIds.size > 0 && (
        <div className="sticky top-0 z-30 mb-2 flex items-center gap-4 rounded-lg border border-edge bg-surface-card px-4 py-2.5 shadow-lg">
          <span className="text-sm font-medium text-content">{selectedIds.size} {t("selected")}</span>
          <div className="flex-1" />
          <ShinyButton onClick={() => router.push(`/chat?findings=${[...selectedIds].join(",")}`)}>
            {selectedIds.size === 1 ? t("discuss") : t("analyze_together", { count: selectedIds.size })}
          </ShinyButton>
          <button onClick={() => setSelectedIds(new Set())}
            className="rounded-lg border border-edge px-3 py-1.5 text-xs font-medium text-content-secondary transition-colors hover:bg-surface-card-hover">
            {tc("clear_filters")}
          </button>
        </div>
      )}

      <DataTable columns={columns} data={filtered} onRowClick={(row) => setSelectedFinding(row)} getRowKey={(row) => row.id}
        emptyMessage={t("no_match")} />

      <SideDrawer open={selectedFinding !== null} onClose={() => setSelectedFinding(null)} title={selectedFinding?.title || ""}>
        {selectedFinding && <FindingDrawerContent finding={selectedFinding} onDiscuss={() => router.push(`/chat?finding=${selectedFinding.id}`)} />}
      </SideDrawer>
    </>
  );
}

function FindingDrawerContent({ finding, onDiscuss }: { finding: FindingProjection; onDiscuss: () => void }) {
  const td = useTranslations("console.finding_drawer");
  const tc = useTranslations("console.common");

  const packLabels: Record<string, string> = {
    scale_readiness: tc("pack_labels.scale_readiness"),
    revenue_integrity: tc("pack_labels.revenue_integrity"),
    chargeback_resilience: tc("pack_labels.chargeback_resilience"),
    saas_growth_readiness: tc("pack_labels.saas_growth_readiness"),
  };

  const impactTypeLabels: Record<string, string> = {
    revenue_loss: tc("impact_types.revenue_loss"),
    conversion_loss: tc("impact_types.conversion_loss"),
    chargeback_risk: tc("impact_types.chargeback_risk"),
    traffic_waste: tc("impact_types.traffic_waste"),
    lifetime_value_loss: tc("impact_types.lifetime_value_loss"),
    none: tc("impact_types.none"),
  };

  return (
    <div className="space-y-6">
      {/* Summary + badges */}
      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-content-muted">{td("summary")}</h3>
        <p className="text-sm text-content-secondary">{finding.cause}</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {finding.polarity === 'positive'
            ? <span className="rounded bg-emerald-500/10 px-2 py-0.5 text-xs dark:text-emerald-400 text-emerald-600">{tc("healthy")}</span>
            : <SeverityBadge value={finding.severity} />}
          <VerificationBadge value={finding.verification_maturity} />
          {finding.change_class && <ChangeBadge value={finding.change_class} />}
          <span className="text-xs text-content-muted">{tc("confidence_label", { value: finding.confidence })}</span>
          <span className="rounded border border-edge px-2 py-0.5 text-xs text-content-muted">{packLabels[finding.pack] || finding.pack}</span>
          {finding.surface && <code className="rounded border border-edge px-2 py-0.5 text-xs text-content-muted">{finding.surface}</code>}
        </div>
      </section>

      {/* Suppression Callout */}
      {finding.suppression_context && finding.suppression_context.is_suppressed && (
        <section>
          <div className="rounded-md border border-amber-900/50 bg-amber-500/5 px-4 py-3">
            <div className="flex items-center gap-2 mb-1">
              <span className="dark:text-amber-500 text-amber-600 text-xs font-semibold">{td("suppressed")}</span>
              <span className="rounded border border-amber-500/20 bg-amber-500/10 px-1.5 py-0.5 text-[10px] dark:text-amber-400 text-amber-600">
                {finding.suppression_context.visibility}
              </span>
            </div>
            <p className="text-xs dark:text-amber-300/80 text-amber-600/80">{finding.suppression_context.explanation}</p>
            {finding.suppression_context.confidence_reduction > 0 && (
              <p className="mt-1 text-xs dark:text-amber-400/60 text-amber-600/60">
                {td("confidence_reduced", { points: finding.suppression_context.confidence_reduction })}
              </p>
            )}
          </div>
        </section>
      )}

      {/* Effect */}
      {finding.effect && (
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-content-muted">{td("effect")}</h3>
          <p className="text-sm text-content-muted">{finding.effect}</p>
        </section>
      )}

      {/* Root Cause */}
      {finding.root_cause && (
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-content-muted">{td("root_cause")}</h3>
          <div className="rounded-md border border-edge bg-surface-card px-4 py-3">
            <span className="text-sm font-medium text-content-secondary">{finding.root_cause}</span>
          </div>
        </section>
      )}

      {/* Impact Breakdown */}
      {finding.polarity !== 'positive' && (
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-content-muted">{td("impact_breakdown")}</h3>
          <div className="space-y-2">
            <div className="flex items-center justify-between rounded-md border border-edge bg-surface-card px-4 py-2">
              <span className="text-xs text-content-muted">{td("monthly_range")}</span>
              <ImpactBadge min={finding.impact.monthly_range.min} max={finding.impact.monthly_range.max} />
            </div>
            <div className="flex items-center justify-between rounded-md border border-edge bg-surface-card px-4 py-2">
              <span className="text-xs text-content-muted">{td("midpoint")}</span>
              <ImpactBadge min={finding.impact.midpoint} max={finding.impact.midpoint} compact />
            </div>
            <div className="flex items-center justify-between rounded-md border border-edge bg-surface-card px-4 py-2">
              <span className="text-xs text-content-muted">{td("impact_type")}</span>
              <span className="text-xs text-content-secondary">{impactTypeLabels[finding.impact.impact_type] || finding.impact.impact_type}</span>
            </div>
          </div>
        </section>
      )}

      {/* Evidence Quality */}
      {finding.evidence_quality && (
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-content-muted">{td("evidence_quality")}</h3>
          <div className="space-y-2 rounded-md border border-edge bg-surface-card px-4 py-3">
            <EvidenceQualityBar label={td("source_reliability")} value={finding.evidence_quality.source_reliability} />
            <EvidenceQualityBar label={td("completeness")} value={finding.evidence_quality.completeness} />
            <EvidenceQualityBar label={td("recency")} value={finding.evidence_quality.recency} />
            <EvidenceQualityBar label={td("corroboration")} value={finding.evidence_quality.corroboration} />
          </div>
        </section>
      )}

      {/* Verification Lifecycle Panel */}
      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-content-muted">{td("verification")}</h3>
        <VerificationPanel
          maturity={finding.verification_maturity}
          method={finding.verification_method}
          verifiedAt={null}
          expiresAt={null}
          confidenceAtVerification={null}
          currentConfidence={null}
          reTriggerReason={null}
          decisionStatus={null}
          onRequestVerification={() => toast.success(td("verification_requested"))}
        />
      </section>

      {/* Verification Sufficiency Warning */}
      <VerificationSufficiencyWarning
        severity={finding.severity}
        maturity={finding.verification_maturity}
      />

      {/* Reasoning */}
      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-content-muted">
          {finding.polarity === 'positive' ? td("why_good") : td("reasoning")}
        </h3>
        <p className="text-sm leading-relaxed text-content-muted">{finding.reasoning}</p>
      </section>

      {/* Truth Context */}
      {finding.truth_context && finding.truth_context.has_contradictions && (
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider dark:text-amber-500 text-amber-600">{td("evidence_contradictions")}</h3>
          <div className="rounded-md border border-amber-900/50 bg-amber-500/5 px-4 py-3">
            <p className="text-xs dark:text-amber-300 text-amber-600">
              {td("contradictions_detected", {
                count: finding.truth_context.contradiction_count,
                delta: `${finding.truth_context.truth_confidence_delta > 0 ? '+' : ''}${finding.truth_context.truth_confidence_delta}`,
              })}
            </p>
          </div>
        </section>
      )}

      {/* Discuss CTA */}
      {finding.polarity !== 'positive' && (
        <section>
          <button onClick={onDiscuss}
            className="w-full rounded-md border border-emerald-800/50 bg-emerald-500/10 px-4 py-2 text-sm dark:text-emerald-400 text-emerald-600 transition-colors hover:bg-emerald-500/20">
            {td("discuss_finding")}
          </button>
        </section>
      )}
    </div>
  );
}

function EvidenceQualityBar({ label, value }: { label: string; value: number }) {
  const barColor =
    value >= 70 ? 'bg-emerald-500' :
    value >= 40 ? 'bg-amber-500' :
    'bg-red-500';

  return (
    <div className="flex items-center gap-3">
      <span className="w-28 shrink-0 text-xs text-content-muted">{label}</span>
      <div className="flex-1 h-1.5 rounded-full bg-surface-inset">
        <div
          className={`h-1.5 rounded-full transition-all ${barColor}`}
          style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
        />
      </div>
      <span className="w-8 text-right font-mono text-xs text-content-muted">{value}</span>
    </div>
  );
}
