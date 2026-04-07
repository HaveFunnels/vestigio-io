"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import SeverityBadge from "@/components/console/SeverityBadge";
import ConsoleState from "@/components/console/ConsoleState";
import PageHeader from "@/components/console/PageHeader";
import { loadWorkspaces } from "@/lib/console-data";
import { useMcpData } from "@/components/app/McpDataProvider";
import { ShinyButton } from "@/components/ui/shiny-button";
import type { WorkspaceProjection } from "../../../../packages/projections";

// ──────────────────────────────────────────────
// Workspaces Page — Phase 4 UX Overhaul
// ──────────────────────────────────���───────────

function formatCurrency(value: number): string {
  if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `$${(value / 1000).toFixed(1)}k`;
  return `$${Math.round(value)}`;
}

export default function WorkspacesPage() {
  const mcpData = useMcpData();
  const dataState = mcpData.workspaces.status !== "not_ready" ? mcpData.workspaces : loadWorkspaces();
  const t = useTranslations("console.workspaces");
  const tc = useTranslations("console.common");

  return (
    <div className="p-6">
      <PageHeader title={t("title")} subtitle={t("subtitle")} tooltip={tc("page_tooltips.workspaces")} />
      <ConsoleState
        state={dataState}
        loadingLabel={t("loading")}
        emptyLabel={t("empty")}
      >
        {(workspaces) => <WorkspacesContent workspaces={workspaces} />}
      </ConsoleState>
    </div>
  );
}

function WorkspacesContent({
  workspaces,
}: {
  workspaces: WorkspaceProjection[];
}) {
  const router = useRouter();
  const t = useTranslations("console.workspaces");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const toggleSelect = useCallback((id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  // Phase C: split into Core vs Behavioral. Core stays as-is, Behavioral
  // gets a banner + greyed cards when no pixel data is available.
  const coreWorkspaces = workspaces.filter((w) => w.category !== "behavioral");
  const behavioralWorkspaces = workspaces.filter((w) => w.category === "behavioral");

  // Banner state for the behavioral category. We show:
  //  - the locked banner when EVERY behavioral workspace is unconfigured
  //  - the collecting banner when at least one is collecting (not yet active)
  //  - no banner when at least one is active (real findings flowing)
  const allUnconfigured =
    behavioralWorkspaces.length > 0 &&
    behavioralWorkspaces.every((w) => w.pixel_status === "unconfigured");
  const anyCollecting =
    !allUnconfigured &&
    behavioralWorkspaces.some((w) => w.pixel_status === "collecting") &&
    behavioralWorkspaces.every((w) => w.pixel_status !== "active");

  return (
    <>
      {selectedIds.size > 0 && (
        <div className="mb-4 flex items-center gap-4 rounded-lg border border-edge bg-surface-card px-4 py-2.5 shadow-lg">
          <span className="text-sm font-medium text-content">{t("selected", { count: selectedIds.size })}</span>
          <div className="flex-1" />
          <ShinyButton onClick={() => router.push(`/chat?context=workspaces:${[...selectedIds].join(",")}`)}>
            {t("use_as_context")}
          </ShinyButton>
          <button onClick={() => setSelectedIds(new Set())} className="rounded-lg border border-edge px-3 py-1.5 text-xs font-medium text-content-muted transition-colors hover:bg-surface-card-hover">{t("clear")}</button>
        </div>
      )}

      {/* ── Core category ── */}
      {coreWorkspaces.length > 0 && (
        <CategorySection title={t("categories.core")}>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            {coreWorkspaces.map((ws) => (
              <WorkspaceCard
                key={ws.id}
                workspace={ws}
                selected={selectedIds.has(ws.id)}
                onSelectToggle={(e) => toggleSelect(ws.id, e)}
                onOpen={() => router.push(`/app/workspaces/${ws.id}`)}
              />
            ))}
          </div>
        </CategorySection>
      )}

      {/* ── Behavioral category ── */}
      {behavioralWorkspaces.length > 0 && (
        <CategorySection title={t("categories.behavioral")}>
          {(allUnconfigured || anyCollecting) && (
            <PixelBanner
              variant={allUnconfigured ? "locked" : "collecting"}
              message={
                allUnconfigured
                  ? t("categories.behavioral_locked_banner")
                  : t("categories.behavioral_collecting_banner")
              }
              ctaLabel={t("categories.configure_pixel_cta")}
              onCtaClick={() => router.push("/app/settings/data-sources")}
            />
          )}
          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
            {behavioralWorkspaces.map((ws) => {
              const isLocked = ws.pixel_status !== "active";
              return (
                <WorkspaceCard
                  key={ws.id}
                  workspace={ws}
                  selected={selectedIds.has(ws.id)}
                  onSelectToggle={(e) => toggleSelect(ws.id, e)}
                  onOpen={() =>
                    isLocked
                      ? router.push("/app/settings/data-sources")
                      : router.push(`/app/workspaces/${ws.id}`)
                  }
                  locked={isLocked}
                />
              );
            })}
          </div>
        </CategorySection>
      )}
    </>
  );
}

// ──────────────────────────────────────────────
// Category section wrapper
// ──────────────────────────────────────────────

function CategorySection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-8">
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-content-muted">
        {title}
      </h2>
      {children}
    </section>
  );
}

// ──────────────────────────────────────────────
// Pixel status banner — appears under "Behavioral" when locked/collecting
// ──────────────────────────────────────────────

function PixelBanner({
  variant,
  message,
  ctaLabel,
  onCtaClick,
}: {
  variant: "locked" | "collecting";
  message: string;
  ctaLabel: string;
  onCtaClick: () => void;
}) {
  // Locked = yellow (action required); Collecting = blue (informational)
  const styles =
    variant === "locked"
      ? "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300"
      : "border-blue-500/30 bg-blue-500/5 text-blue-700 dark:text-blue-300";
  const buttonStyles =
    variant === "locked"
      ? "border-amber-500/50 bg-amber-500/20 text-amber-700 dark:text-amber-300 hover:bg-amber-500/30"
      : "border-blue-500/40 bg-blue-500/10 text-blue-700 dark:text-blue-300 hover:bg-blue-500/20";

  return (
    <div className={`flex items-start gap-3 rounded-lg border px-4 py-3 ${styles}`}>
      <span className="mt-0.5 text-base" aria-hidden>
        {variant === "locked" ? "\u26A0" : "\u2139"}
      </span>
      <p className="flex-1 text-sm leading-relaxed">{message}</p>
      <button
        onClick={onCtaClick}
        className={`shrink-0 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${buttonStyles}`}
      >
        {ctaLabel}
      </button>
    </div>
  );
}

// ──────────────────────────────────────────────
// Workspace card — handles both active and locked variants
// ──────────────────────────────────────────────

function WorkspaceCard({
  workspace: ws,
  selected,
  onSelectToggle,
  onOpen,
  locked = false,
}: {
  workspace: WorkspaceProjection;
  selected: boolean;
  onSelectToggle: (e: React.MouseEvent) => void;
  onOpen: () => void;
  locked?: boolean;
}) {
  const t = useTranslations("console.workspaces");

  // Locked cards have muted colors and no checkbox (you can't select a
  // workspace that has no data — picking it as chat context would be
  // useless).
  const cardClasses = locked
    ? "group relative w-full rounded-lg border border-dashed border-edge bg-surface-card/40 text-left opacity-60 transition-opacity hover:opacity-80"
    : `group relative w-full rounded-lg border text-left transition-colors hover:border-edge hover:bg-surface-card-hover ${
        selected ? "border-indigo-500/40 bg-indigo-500/5" : "border-edge bg-surface-card"
      }`;

  return (
    <button onClick={onOpen} className={cardClasses}>
      {!locked && (
        <div className="absolute right-3 top-3 z-10" onClick={onSelectToggle}>
          <input
            type="checkbox"
            checked={selected}
            readOnly
            className="h-3.5 w-3.5 cursor-pointer rounded border-edge bg-surface-input text-indigo-500 focus:ring-0"
          />
        </div>
      )}
      <div className="px-5 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className={`text-base font-semibold ${locked ? "text-content-muted" : "text-content"}`}>
              {ws.name}
            </span>
            <span className="rounded border border-edge px-2 py-0.5 text-xs text-content-muted">
              {t.has(`types.${ws.type}`) ? t(`types.${ws.type}`) : ws.type}
            </span>
            {!locked && <WorkspaceChangeTrend summary={ws.change_summary} />}
          </div>
          {!locked && <SeverityBadge value={ws.decision_impact} />}
        </div>

        {locked ? (
          <PixelStatusContent workspace={ws} />
        ) : (
          <ActiveCardContent workspace={ws} />
        )}
      </div>
    </button>
  );
}

// ──────────────────────────────────────────────
// Active card body — the original 4-stat grid + narrative
// ──────────────────────────────────────────────

function ActiveCardContent({ workspace: ws }: { workspace: WorkspaceProjection }) {
  const t = useTranslations("console.workspaces");
  return (
    <>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <div>
          <div className="text-xs text-content-faint">{t("monthly_loss")}</div>
          <div className="text-sm font-bold text-red-500 dark:text-red-400">
            {formatCurrency(ws.summary.total_loss_mid)}
          </div>
        </div>
        <div>
          <div className="text-xs text-content-faint">{t("issues")}</div>
          <div className="text-sm font-medium text-content-secondary">
            {ws.summary.issue_count}
          </div>
        </div>
        <div>
          <div className="text-xs text-content-faint">{t("top_issue")}</div>
          <div className="truncate text-xs text-content-muted">
            {ws.summary.top_issues[0] || "\u2014"}
          </div>
        </div>
      </div>
      {/* Wave 2.4: removed confidence_narrative + ConfidenceBar — those are
          engine-internal signals that don't help an operator decide. */}
      <div className="mt-3 flex items-center gap-1 text-xs font-medium text-accent opacity-0 transition-opacity group-hover:opacity-100">
        {t("view_details")} <span>&rarr;</span>
      </div>
    </>
  );
}

// ──────────────────────────────────────────────
// Locked card body — pixel status + CTA
// ──────────────────────────────────────────────

function PixelStatusContent({ workspace: ws }: { workspace: WorkspaceProjection }) {
  const t = useTranslations("console.workspaces");
  const status = ws.pixel_status;
  if (!status) return null;

  const label =
    status === "collecting" && ws.pixel_progress
      ? t("pixel_status.collecting", {
          current: ws.pixel_progress.current,
          required: ws.pixel_progress.required,
        })
      : status === "collecting"
      ? t("pixel_status.collecting", { current: 0, required: 20 })
      : t("pixel_status.unconfigured");

  return (
    <div className="mt-4 border-t border-dashed border-edge pt-4">
      <div className="flex items-center gap-2 text-xs text-content-muted">
        <span className="inline-block h-2 w-2 rounded-full bg-content-faint" aria-hidden />
        {label}
      </div>
      <p className="mt-2 text-xs leading-relaxed text-content-faint">
        {t("view_details")} <span>&rarr;</span>
      </p>
    </div>
  );
}

function WorkspaceChangeTrend({
  summary,
}: {
  summary: WorkspaceProjection["change_summary"];
}) {
  if (!summary) return null;

  const config: Record<string, { icon: string; color: string; label: string }> =
    {
      degrading: {
        icon: "\u2191",
        color: "text-red-500 dark:text-red-400",
        label: `${summary.regression_count} regression${
          summary.regression_count !== 1 ? "s" : ""
        }`,
      },
      improving: {
        icon: "\u2193",
        color: "text-emerald-600 dark:text-emerald-400",
        label: `${summary.improvement_count} improvement${
          summary.improvement_count !== 1 ? "s" : ""
        }`,
      },
      stable: { icon: "\u2014", color: "text-content-faint", label: "stable" },
      mixed: {
        icon: "\u2195",
        color: "text-amber-600 dark:text-amber-400",
        label: "mixed changes",
      },
    };

  const c = config[summary.trend] || config.stable;

  return (
    <span
      className={`inline-flex items-center gap-1 text-[11px] font-medium ${c.color}`}
    >
      <span className="text-xs">{c.icon}</span>
      {c.label}
    </span>
  );
}

