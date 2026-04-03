"use client";

import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
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

const severityOptions: { label: string; value: SeverityFilter }[] = [
  { label: "All Severities", value: "all" },
  { label: "Critical", value: "critical" },
  { label: "High", value: "high" },
  { label: "Medium", value: "medium" },
  { label: "Low", value: "low" },
];

const packOptions: { label: string; value: PackFilter }[] = [
  { label: "All Packs", value: "all" },
  { label: "Scale Readiness", value: "scale_readiness" },
  { label: "Revenue Integrity", value: "revenue_integrity" },
  { label: "Chargeback", value: "chargeback_resilience" },
  { label: "SaaS Growth", value: "saas_growth_readiness" },
];

const polarityOptions: { label: string; value: PolarityFilter }[] = [
  { label: "All Findings", value: "all" },
  { label: "Issues", value: "negative" },
  { label: "Positive", value: "positive" },
  { label: "Neutral", value: "neutral" },
];

const packLabels: Record<string, string> = {
  scale_readiness: "Scale",
  revenue_integrity: "Revenue",
  chargeback_resilience: "Chargeback",
  saas_growth_readiness: "SaaS",
};

const impactTypeLabels: Record<string, string> = {
  revenue_loss: "Revenue Loss",
  conversion_loss: "Conversion Loss",
  chargeback_risk: "Chargeback Risk",
  traffic_waste: "Traffic Waste",
  lifetime_value_loss: "LTV Loss",
  none: "—",
};

const polarityIcons: Record<string, string> = {
  negative: "!",
  positive: "\u2713",
  neutral: "\u2022",
};

const polarityColors: Record<string, string> = {
  negative: "text-red-400",
  positive: "text-emerald-400",
  neutral: "text-zinc-500",
};

export default function AnalysisPage() {
  const [analysisState, setAnalysisState] = useState<AnalysisState>("idle");
  const [currentStep, setCurrentStep] = useState<string | null>(null);
  const [findings, setFindings] = useState<FindingProjection[]>([]);
  const [stepHistory, setStepHistory] = useState<string[]>([]);
  const [coverageScore, setCoverageScore] = useState<number>(0);
  const [totalImpact, setTotalImpact] = useState<number>(0);
  const [challengeInfo, setChallengeInfo] = useState<{ type: string; url: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Try loading existing findings first
  const existingState = loadFindings();
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
        setError("Connection lost");
      }
      setAnalysisState("complete");
      evtSource.close();
    });

    evtSource.onerror = () => {
      setAnalysisState("complete");
      evtSource.close();
    };
  }, []);

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
        <ConsoleState state={existingState} loadingLabel="Analyzing your domain..." emptyLabel="No findings detected yet.">
          {(data) => <AnalysisContent findings={data} analysisState="complete" currentStep={null} stepHistory={[]} coverageScore={100} challengeInfo={null} />}
        </ConsoleState>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-zinc-100">Analysis</h1>
        <p className="mt-1 text-sm text-zinc-500">
          {analysisState === "ongoing"
            ? "Analysis in progress — findings appear as they're ready."
            : "Global findings with quantified financial impact."}
        </p>
      </div>

      {/* Step Timeline (during ongoing analysis) */}
      {analysisState === "ongoing" && currentStep && (
        <div className="mb-6 rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
          <div className="flex items-center gap-3">
            <div className="h-3 w-3 animate-pulse rounded-full bg-emerald-500" />
            <span className="text-sm font-medium text-zinc-200">{currentStep}</span>
          </div>
          {stepHistory.length > 1 && (
            <div className="mt-3 space-y-1">
              {stepHistory.slice(0, -1).map((step, i) => (
                <div key={i} className="flex items-center gap-3 pl-1">
                  <div className="h-1.5 w-1.5 rounded-full bg-zinc-700" />
                  <span className="text-xs text-zinc-600">{step}</span>
                </div>
              ))}
            </div>
          )}
          {coverageScore > 0 && (
            <div className="mt-3 flex items-center gap-2">
              <div className="h-1.5 flex-1 rounded-full bg-zinc-800">
                <div className="h-1.5 rounded-full bg-emerald-600 transition-all duration-500" style={{ width: `${coverageScore}%` }} />
              </div>
              <span className="text-xs text-zinc-500">{coverageScore}% coverage</span>
            </div>
          )}
        </div>
      )}

      {/* Challenge Warning */}
      {challengeInfo && (
        <div className="mb-4 rounded-lg border border-amber-900/50 bg-amber-500/5 px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="text-amber-500">&#9888;</span>
            <span className="text-sm font-medium text-amber-300">Protection detected: {challengeInfo.type}</span>
          </div>
          <p className="mt-1 text-xs text-amber-400/70">
            Access to {challengeInfo.url} is restricted. Add Vestigio's IP to your allowlist for optimal results.
          </p>
        </div>
      )}

      {error && (
        <div className="mb-4 rounded-lg border border-red-900/50 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Skeleton during loading */}
      {analysisState === "ongoing" && findings.length === 0 && (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="flex items-center gap-4 rounded-lg border border-zinc-800 bg-zinc-900/30 p-4">
              <div className="h-4 w-4 animate-pulse rounded bg-zinc-800" />
              <div className="flex-1 space-y-2">
                <div className="h-3 w-3/4 animate-pulse rounded bg-zinc-800" />
                <div className="h-2 w-1/2 animate-pulse rounded bg-zinc-800" />
              </div>
              <div className="h-6 w-16 animate-pulse rounded bg-zinc-800" />
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
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>("all");
  const [packFilter, setPackFilter] = useState<PackFilter>("all");
  const [polarityFilter, setPolarityFilter] = useState<PolarityFilter>("all");
  const [hidePositive, setHidePositive] = useState(false);
  const [selectedFinding, setSelectedFinding] = useState<FindingProjection | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const filtered = useMemo(() => {
    return findings.filter((f) => {
      // Phase 0 UX: Hide suppressed findings with 'hidden' visibility
      if (f.suppression_context?.visibility === 'hidden') return false;
      if (severityFilter !== "all" && f.severity !== severityFilter) return false;
      if (packFilter !== "all" && f.pack !== packFilter) return false;
      if (polarityFilter !== "all" && f.polarity !== polarityFilter) return false;
      if (hidePositive && f.polarity === "positive") return false;
      return true;
    });
  }, [findings, severityFilter, packFilter, polarityFilter, hidePositive]);

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
        label: "Findings",
        value: `${negativeFindings.length} issues, ${positiveFindings.length} strengths`,
        subtext: analysisState === "ongoing" ? "updating..." : undefined,
      },
      {
        label: "Est. Monthly Impact",
        value: totalImpactMid >= 1000 ? `$${(totalImpactMid / 1000).toFixed(1)}k` : `$${totalImpactMid}`,
        variant: totalImpactMid >= 20000 ? "danger" : totalImpactMid >= 5000 ? "warning" : "success",
        subtext: "/month (midpoint)",
      },
      { label: "High Impact Issues", value: highImpact, variant: highImpact > 0 ? "danger" : "success", subtext: "> $10k/mo" },
      { label: "Avg Confidence", value: `${avgConf}%`, variant: "default" },
    ];
  }, [findings, analysisState]);

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
          className="h-3.5 w-3.5 cursor-pointer rounded border-zinc-600 bg-zinc-800 text-emerald-500 focus:ring-0" />
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
      key: "title", label: "Finding",
      render: (row) => {
        const isDimmed = row.suppression_context?.visibility === 'dimmed';
        const isAnnotated = row.suppression_context?.visibility === 'annotated';
        return (
          <div className={isDimmed ? 'opacity-50' : ''}>
            <div className="flex items-center gap-2">
              <span className={`text-sm ${row.polarity === 'positive' ? 'text-emerald-300' : 'text-zinc-200'}`}>{row.title}</span>
              {isAnnotated && (
                <span className="rounded border border-amber-500/20 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-400">
                  Suppressed
                </span>
              )}
            </div>
            {row.root_cause && <div className="mt-0.5 text-xs text-zinc-500">{row.root_cause}</div>}
          </div>
        );
      },
    },
    {
      key: "severity", label: "Severity", className: "w-24",
      render: (row) => row.polarity === 'positive'
        ? <span className="rounded bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-400">Healthy</span>
        : <SeverityBadge value={row.severity} />,
    },
    {
      key: "verification", label: "Verified", className: "w-24",
      render: (row) => <VerificationBadge value={row.verification_maturity} />,
    },
    {
      key: "change", label: "Change", className: "w-28",
      render: (row) => <ChangeBadge value={row.change_class} />,
    },
    { key: "confidence", label: "Conf", className: "w-16", render: (row) => <span className="font-mono text-xs text-zinc-400">{row.confidence}%</span> },
    {
      key: "impact", label: "Est. Impact", className: "w-44",
      render: (row) => row.polarity === 'positive'
        ? <span className="text-xs text-zinc-500">—</span>
        : <ImpactBadge min={row.impact.monthly_range.min} max={row.impact.monthly_range.max} />,
    },
    { key: "impact_type", label: "Type", className: "w-28", render: (row) => <span className="text-xs text-zinc-400">{impactTypeLabels[row.impact.impact_type] || row.impact.impact_type}</span> },
    { key: "pack", label: "Pack", className: "w-20", render: (row) => <span className="rounded border border-zinc-700 px-2 py-0.5 text-xs text-zinc-400">{packLabels[row.pack] || row.pack}</span> },
    {
      key: "discuss", label: "", className: "w-20",
      render: (row) => row.polarity !== 'positive' ? (
        <button onClick={(e) => { e.stopPropagation(); router.push(`/chat?finding=${row.id}`); }}
          className="rounded border border-zinc-700 px-2 py-1 text-xs text-zinc-400 transition-colors hover:border-emerald-600 hover:text-emerald-400">
          Discuss
        </button>
      ) : null,
    },
  ];

  return (
    <>
      <div className="mb-6"><SummaryCards cards={summaryCards} /></div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <select value={polarityFilter} onChange={(e) => setPolarityFilter(e.target.value as PolarityFilter)}
          className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-300 focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600">
          {polarityOptions.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
        </select>
        <select value={severityFilter} onChange={(e) => setSeverityFilter(e.target.value as SeverityFilter)}
          className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-300 focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600">
          {severityOptions.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
        </select>
        <select value={packFilter} onChange={(e) => setPackFilter(e.target.value as PackFilter)}
          className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-300 focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600">
          {packOptions.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
        </select>

        <label className="flex items-center gap-1.5 text-xs text-zinc-500 cursor-pointer">
          <input type="checkbox" checked={hidePositive} onChange={(e) => setHidePositive(e.target.checked)}
            className="h-3 w-3 rounded border-zinc-600 bg-zinc-800 text-emerald-500 focus:ring-0" />
          Hide positive signals
        </label>

        {(severityFilter !== "all" || packFilter !== "all" || polarityFilter !== "all") && (
          <button onClick={() => { setSeverityFilter("all"); setPackFilter("all"); setPolarityFilter("all"); }}
            className="rounded-md px-3 py-1.5 text-xs text-zinc-500 transition-colors hover:text-zinc-300">Clear filters</button>
        )}
        {selectedIds.size >= 2 && (
          <button onClick={() => router.push(`/chat?findings=${[...selectedIds].join(",")}`)}
            className="rounded-md border border-emerald-600/50 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-400 transition-colors hover:bg-emerald-500/20">
            Analyze {selectedIds.size} Together
          </button>
        )}
        <span className="ml-auto text-xs text-zinc-500">{filtered.length} of {findings.length} findings</span>
      </div>

      <DataTable columns={columns} data={filtered} onRowClick={(row) => setSelectedFinding(row)} getRowKey={(row) => row.id}
        emptyMessage="No findings match the current filters." />

      <SideDrawer open={selectedFinding !== null} onClose={() => setSelectedFinding(null)} title={selectedFinding?.title || ""}>
        {selectedFinding && <FindingDrawerContent finding={selectedFinding} onDiscuss={() => router.push(`/chat?finding=${selectedFinding.id}`)} />}
      </SideDrawer>
    </>
  );
}

function FindingDrawerContent({ finding, onDiscuss }: { finding: FindingProjection; onDiscuss: () => void }) {
  return (
    <div className="space-y-6">
      {/* Summary + badges */}
      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">Summary</h3>
        <p className="text-sm text-zinc-300">{finding.cause}</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {finding.polarity === 'positive'
            ? <span className="rounded bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-400">Healthy</span>
            : <SeverityBadge value={finding.severity} />}
          <VerificationBadge value={finding.verification_maturity} />
          {finding.change_class && <ChangeBadge value={finding.change_class} />}
          <span className="text-xs text-zinc-500">Confidence {finding.confidence}%</span>
          <span className="rounded border border-zinc-700 px-2 py-0.5 text-xs text-zinc-400">{packLabels[finding.pack] || finding.pack}</span>
          {finding.surface && <code className="rounded border border-zinc-700 px-2 py-0.5 text-xs text-zinc-500">{finding.surface}</code>}
        </div>
      </section>

      {/* Suppression Callout */}
      {finding.suppression_context && finding.suppression_context.is_suppressed && (
        <section>
          <div className="rounded-md border border-amber-900/50 bg-amber-500/5 px-4 py-3">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-amber-500 text-xs font-semibold">Suppressed</span>
              <span className="rounded border border-amber-500/20 bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-400">
                {finding.suppression_context.visibility}
              </span>
            </div>
            <p className="text-xs text-amber-300/80">{finding.suppression_context.explanation}</p>
            {finding.suppression_context.confidence_reduction > 0 && (
              <p className="mt-1 text-xs text-amber-400/60">
                Confidence reduced by {finding.suppression_context.confidence_reduction} points
              </p>
            )}
          </div>
        </section>
      )}

      {/* Effect */}
      {finding.effect && (
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">Effect</h3>
          <p className="text-sm text-zinc-400">{finding.effect}</p>
        </section>
      )}

      {/* Root Cause */}
      {finding.root_cause && (
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">Root Cause</h3>
          <div className="rounded-md border border-zinc-800 bg-zinc-900/50 px-4 py-3">
            <span className="text-sm font-medium text-zinc-200">{finding.root_cause}</span>
          </div>
        </section>
      )}

      {/* Impact Breakdown */}
      {finding.polarity !== 'positive' && (
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">Impact Breakdown</h3>
          <div className="space-y-2">
            <div className="flex items-center justify-between rounded-md border border-zinc-800 bg-zinc-900/50 px-4 py-2">
              <span className="text-xs text-zinc-500">Monthly Range</span>
              <ImpactBadge min={finding.impact.monthly_range.min} max={finding.impact.monthly_range.max} />
            </div>
            <div className="flex items-center justify-between rounded-md border border-zinc-800 bg-zinc-900/50 px-4 py-2">
              <span className="text-xs text-zinc-500">Midpoint</span>
              <ImpactBadge min={finding.impact.midpoint} max={finding.impact.midpoint} compact />
            </div>
            <div className="flex items-center justify-between rounded-md border border-zinc-800 bg-zinc-900/50 px-4 py-2">
              <span className="text-xs text-zinc-500">Impact Type</span>
              <span className="text-xs text-zinc-300">{impactTypeLabels[finding.impact.impact_type] || finding.impact.impact_type}</span>
            </div>
          </div>
        </section>
      )}

      {/* Evidence Quality */}
      {finding.evidence_quality && (
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">Evidence Quality</h3>
          <div className="space-y-2 rounded-md border border-zinc-800 bg-zinc-900/50 px-4 py-3">
            <EvidenceQualityBar label="Source Reliability" value={finding.evidence_quality.source_reliability} />
            <EvidenceQualityBar label="Completeness" value={finding.evidence_quality.completeness} />
            <EvidenceQualityBar label="Recency" value={finding.evidence_quality.recency} />
            <EvidenceQualityBar label="Corroboration" value={finding.evidence_quality.corroboration} />
          </div>
        </section>
      )}

      {/* Verification Lifecycle Panel */}
      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">Verification</h3>
        <VerificationPanel
          maturity={finding.verification_maturity}
          method={finding.verification_method}
          verifiedAt={null}
          expiresAt={null}
          confidenceAtVerification={null}
          currentConfidence={null}
          reTriggerReason={null}
          decisionStatus={null}
          onRequestVerification={() => toast.success("Verification requested")}
        />
      </section>

      {/* Verification Sufficiency Warning */}
      <VerificationSufficiencyWarning
        severity={finding.severity}
        maturity={finding.verification_maturity}
      />

      {/* Reasoning */}
      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">
          {finding.polarity === 'positive' ? 'Why This Is Good' : 'Reasoning'}
        </h3>
        <p className="text-sm leading-relaxed text-zinc-400">{finding.reasoning}</p>
      </section>

      {/* Truth Context */}
      {finding.truth_context && finding.truth_context.has_contradictions && (
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-amber-500">Evidence Contradictions</h3>
          <div className="rounded-md border border-amber-900/50 bg-amber-500/5 px-4 py-3">
            <p className="text-xs text-amber-300">
              {finding.truth_context.contradiction_count} contradiction{finding.truth_context.contradiction_count > 1 ? 's' : ''} detected in backing evidence.
              Confidence adjusted by {finding.truth_context.truth_confidence_delta > 0 ? '+' : ''}{finding.truth_context.truth_confidence_delta}%.
            </p>
          </div>
        </section>
      )}

      {/* Discuss CTA */}
      {finding.polarity !== 'positive' && (
        <section>
          <button onClick={onDiscuss}
            className="w-full rounded-md border border-emerald-800/50 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-400 transition-colors hover:bg-emerald-500/20">
            Discuss This Finding
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
      <span className="w-28 shrink-0 text-xs text-zinc-500">{label}</span>
      <div className="flex-1 h-1.5 rounded-full bg-zinc-800">
        <div
          className={`h-1.5 rounded-full transition-all ${barColor}`}
          style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
        />
      </div>
      <span className="w-8 text-right font-mono text-xs text-zinc-400">{value}</span>
    </div>
  );
}
