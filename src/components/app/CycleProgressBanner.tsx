"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";

// ──────────────────────────────────────────────
// CycleProgressBanner  (Wave 5 Fase 2)
//
// Sticks a thin live progress strip at the top of /app/inventory,
// /app/analysis, and /app/actions whenever there's an in-flight
// AuditCycle for the viewer's environment. Consumes the SSE stream
// from /api/cycles/[id]/stream (pure observer — the crawl runs
// fire-and-forget from /api/environments/activate).
//
// Two discovery paths for the cycle id:
//   1. `?cycle=<id>` query param — set by the activation flow when
//      it redirects here, so the banner appears instantly without a
//      round-trip to find the cycle.
//   2. Fetches the user's latest running cycle via /api/cycles/latest
//      on mount — covers reloads and tab-switches where the query
//      param got lost.
//
// The banner hides once status becomes `complete` or `failed`. On
// `complete` it nudges `router.refresh()` so the underlying page
// re-fetches with the new findings persisted.
// ──────────────────────────────────────────────

interface CycleSnapshot {
  status: string;
  cycleType: string;
  pagesDiscovered: number;
  findingsCount: number;
  durationMs: number;
}

interface Props {
  // Allow callers to hide the banner entirely on pages where it would
  // overlap another progress indicator.
  hidden?: boolean;
}

export default function CycleProgressBanner({ hidden = false }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const cycleFromQuery = searchParams.get("cycle");
  const t = useTranslations("console.cycle_banner");

  const [cycleId, setCycleId] = useState<string | null>(cycleFromQuery);
  const [snap, setSnap] = useState<CycleSnapshot | null>(null);
  const [done, setDone] = useState<"complete" | "failed" | null>(null);
  const [hiddenLocal, setHiddenLocal] = useState(false);

  // Discovery: if no cycle id in the URL, ask the server which cycle (if
  // any) is still running for this user. A missing /api/cycles/latest
  // route or a 404 just means "no running cycle" — we keep the banner
  // hidden.
  useEffect(() => {
    if (cycleId) return;
    let cancelled = false;
    fetch("/api/cycles/latest?status=running,pending")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled) return;
        if (data?.cycle?.id) setCycleId(data.cycle.id);
      })
      .catch(() => {
        // no-op — banner stays hidden
      });
    return () => {
      cancelled = true;
    };
  }, [cycleId]);

  // SSE subscription to /api/cycles/[id]/stream.
  useEffect(() => {
    if (!cycleId) return;
    const source = new EventSource(`/api/cycles/${cycleId}/stream`);

    source.addEventListener("status", (e: MessageEvent) => {
      try {
        setSnap(JSON.parse(e.data));
      } catch {
        // swallow parse errors — next tick will replace
      }
    });

    source.addEventListener("complete", (e: MessageEvent) => {
      try {
        const parsed = JSON.parse(e.data);
        const status = parsed.status === "failed" ? "failed" : "complete";
        setDone(status);
      } catch {
        setDone("complete");
      }
      source.close();
      // Let the page refetch with the new findings.
      router.refresh();
    });

    source.addEventListener("error", () => {
      // Browser will auto-retry unless we close; close explicitly so a
      // disappeared cycle doesn't cause a reconnect storm.
      source.close();
    });

    return () => {
      source.close();
    };
  }, [cycleId, router]);

  if (hidden || hiddenLocal || !cycleId || !snap) return null;

  // On complete/failed we still want to show the final state briefly
  // so the user sees it land. The inline "Dismiss" button hides it.
  const isRunning = snap.status === "running" || snap.status === "pending";
  const label = done
    ? done === "failed"
      ? t("failed")
      : t("complete")
    : snap.status === "pending"
      ? t("queued")
      : t("running");

  const barColor =
    done === "failed"
      ? "bg-red-500"
      : done === "complete"
        ? "bg-emerald-500"
        : "bg-accent";

  return (
    <div className="relative overflow-hidden rounded-lg border border-edge bg-surface-card">
      {/* Indeterminate progress bar while running, full bar when done */}
      <div
        className={`absolute inset-x-0 bottom-0 h-0.5 ${barColor} ${
          isRunning ? "animate-pulse" : ""
        }`}
        style={{
          width: done ? "100%" : isRunning ? "70%" : "0%",
          transition: "width 400ms ease-out",
        }}
      />
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-content">{label}</p>
          <p className="mt-0.5 truncate text-xs text-content-faint">
            {snap.pagesDiscovered === 1
              ? t("pages_one")
              : t("pages_other", { count: snap.pagesDiscovered })}
            {" · "}
            {snap.findingsCount === 1
              ? t("findings_one")
              : t("findings_other", { count: snap.findingsCount })}{" "}
            {isRunning ? t("so_far") : t("in_total")}
            {" · "}
            {t("elapsed", { seconds: Math.round(snap.durationMs / 1000) })}
          </p>
        </div>
        {done && (
          <button
            onClick={() => setHiddenLocal(true)}
            className="rounded-md border border-edge px-2 py-1 text-xs font-medium text-content-secondary transition-colors hover:bg-surface-card-hover hover:text-content"
          >
            {t("dismiss")}
          </button>
        )}
      </div>
    </div>
  );
}
