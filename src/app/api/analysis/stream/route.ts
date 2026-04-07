import { NextResponse } from "next/server";
import { isAuthorized } from "@/libs/isAuthorized";
import { runStagedPipeline, type PipelineEvent, type StagedPipelineInput } from "../../../../../workers/ingestion/staged-pipeline";
import { recomputeAll } from "../../../../../packages/workspace";
import { projectAll } from "../../../../../packages/projections";
import { loadEngineTranslations } from "@/lib/engine-translations";
import { enqueueJob, startJob, updateJobProgress, completeJob, failJob, getJobForEnvironment } from "../../../../../apps/platform/job-queue";
import { getMcpServer } from "@/lib/mcp-client";
import { bootstrapMcpContextSync } from "../../../../../apps/mcp/bootstrap";
import { getMcpPersistenceStore } from "../../../../../apps/platform/mcp-persistence";
import type { AnalysisJobRecord } from "../../../../../apps/platform/mcp-persistence";
import { trackError } from "@/libs/error-tracker";
import { PrismaEvidenceStore } from "../../../../../packages/evidence";
import { PrismaSnapshotStore } from "../../../../../packages/change-detection";
import { PrismaFindingStore } from "../../../../../packages/projections";
import { prisma } from "@/libs/prismaDb";
import { triggerIncidentNotifications, triggerRegressionNotifications } from "@/libs/notification-triggers";

// ──────────────────────────────────────────────
// Analysis Stream — SSE Endpoint (resilient)
//
// Features:
// - Progressive analysis events via SSE
// - Reconnect support (Last-Event-ID)
// - Idempotent event IDs
// - Job queue integration (1 per env)
// - Heartbeat keep-alive
//
// Content-Type: text/event-stream
// ──────────────────────────────────────────────

// In-memory event cache for reconnect support
const eventCache = new Map<string, { events: Array<{ id: string; event: string; data: any }>; timestamp: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function getCacheKey(userId: string, domain: string): string {
  return `${userId}:${domain}`;
}

export async function GET(request: Request) {
  const user = await isAuthorized();
  if (!user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const domain = searchParams.get("domain");
  const environmentId = searchParams.get("environment_id") || "default";
  const businessModel = searchParams.get("business_model") || null;
  const conversionModel = searchParams.get("conversion_model") || null;
  const lastEventId = request.headers.get("Last-Event-ID") || searchParams.get("last_event_id");

  if (!domain) {
    return NextResponse.json({ message: "domain parameter required" }, { status: 400 });
  }

  const encoder = new TextEncoder();
  const cacheKey = getCacheKey(user.id, domain);

  // Reconnect support — replay missed events
  if (lastEventId) {
    const cached = eventCache.get(cacheKey);
    if (cached) {
      const idx = cached.events.findIndex(e => e.id === lastEventId);
      if (idx >= 0) {
        const missed = cached.events.slice(idx + 1);
        if (missed.length > 0) {
          const stream = new ReadableStream({
            start(controller) {
              for (const evt of missed) {
                controller.enqueue(encoder.encode(`id: ${evt.id}\nevent: ${evt.event}\ndata: ${JSON.stringify(evt.data)}\n\n`));
              }
              controller.close();
            },
          });
          return new Response(stream, {
            headers: {
              "Content-Type": "text/event-stream",
              "Cache-Control": "no-cache",
              Connection: "keep-alive",
            },
          });
        }
      }
    }
  }

  // Enqueue job — enforce 1 per environment
  const enqueueResult = enqueueJob(environmentId, user.id);
  if (!enqueueResult.enqueued || !enqueueResult.job) {
    // If a job is already running, tell the client
    const existingJob = getJobForEnvironment(environmentId);
    const stream = new ReadableStream({
      start(controller) {
        const msg = existingJob
          ? { status: 'already_running', job_id: existingJob.id, progress: existingJob.progress }
          : { status: 'queue_full', message: enqueueResult.reason };
        controller.enqueue(encoder.encode(`event: blocked\ndata: ${JSON.stringify(msg)}\n\n`));
        controller.close();
      },
    });
    return new Response(stream, {
      headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
    });
  }

  const jobId = enqueueResult.job.id;
  startJob(jobId);

  // Initialize event cache for this stream
  eventCache.set(cacheKey, { events: [], timestamp: Date.now() });

  const stream = new ReadableStream({
    async start(controller) {
      let eventCounter = 0;
      const cachedEvents: Array<{ id: string; event: string; data: any }> = [];

      const send = (event: string, data: any) => {
        const id = `${jobId}_${++eventCounter}`;
        const payload = { ...data, _event_id: id };
        controller.enqueue(encoder.encode(`id: ${id}\nevent: ${event}\ndata: ${JSON.stringify(payload)}\n\n`));
        cachedEvents.push({ id, event, data: payload });
      };

      // Heartbeat to keep connection alive
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: heartbeat\n\n`));
        } catch { clearInterval(heartbeat); }
      }, 15000);

      const pipelineInput: StagedPipelineInput = {
        domain,
        workspace_ref: `workspace:${user.id}`,
        environment_ref: `environment:${environmentId}`,
        website_ref: `website:${domain}`,
        cycle_ref: `audit_cycle:live_${Date.now()}`,
        onboarding_business_model: businessModel ?? undefined,
        onboarding_conversion_model: conversionModel ?? undefined,
      };

      const onEvent = (event: PipelineEvent) => {
        send(event.type, {
          stage: event.stage,
          ...event.data,
          timestamp: event.timestamp.toISOString(),
        });

        // Update job progress based on stage
        if (event.type === 'stage_complete') {
          const progressMap: Record<string, number> = {
            bootstrap: 20, first_value: 40, crawl: 70, headless: 85, complete: 100,
          };
          updateJobProgress(jobId, progressMap[event.stage] || 50, event.stage);
        }
      };

      try {
        send('connected', { message: 'Analysis stream connected', job_id: jobId });

        const result = await runStagedPipeline(pipelineInput, onEvent);

        // Load engine translations for user's locale
        const engineTranslations = await loadEngineTranslations();

        // Wave 0.7: Look up previous snapshot for change detection.
        // The legacy stream route doesn't know which AuditCycle row it
        // belongs to (this path is the manual "run analysis" pre-Wave 0.1
        // flow), so we scope by workspace+environment_ref alone.
        const snapshotStore = new PrismaSnapshotStore(prisma);
        let previousSnapshot = null;
        try {
          const prev = await snapshotStore.asyncGetLatest(
            pipelineInput.workspace_ref,
            pipelineInput.environment_ref,
          );
          previousSnapshot = prev?.snapshot ?? null;
        } catch (err) {
          console.warn('[analysis-stream] previous snapshot lookup failed:', err);
        }

        // Final recompute with all evidence
        const multiPackResult = recomputeAll({
          evidence: result.evidence,
          scoping: {
            workspace_ref: pipelineInput.workspace_ref,
            environment_ref: pipelineInput.environment_ref,
            subject_ref: pipelineInput.website_ref,
            path_scope: null,
          },
          cycle_ref: pipelineInput.cycle_ref,
          root_domain: domain.replace(/^https?:\/\//, '').split('/')[0],
          landing_url: domain.startsWith('http') ? domain : `https://${domain}`,
          conversion_proximity: 0.5,
          is_production: false,
          onboarding_business_model: businessModel,
          onboarding_conversion_model: conversionModel,
          previous_snapshot: previousSnapshot,
          translations: engineTranslations,
        });

        // Wave 0.7: Save the new snapshot so the next request to this
        // env can compare against it. Fire-and-forget — failure here
        // doesn't break the user-visible flow.
        //
        // Note: this legacy stream route doesn't create an AuditCycle DB
        // row (it uses a synthetic `audit_cycle:live_${ts}` ref), so we
        // can't persist Finding rows here — they need a real cycleId for
        // FK. The audit-runner worker is the canonical path that persists
        // both snapshot AND findings. This route only needs the snapshot
        // for change detection continuity if someone uses the manual
        // "Run analysis" button twice on the same env.
        if (multiPackResult.current_snapshot) {
          snapshotStore
            .asyncSave(multiPackResult.current_snapshot)
            .catch((err) => {
              console.error('[analysis-stream] snapshot save failed:', err);
            });
        }

        const projections = projectAll(multiPackResult, engineTranslations);

        send('findings', {
          findings: projections.findings,
          actions: projections.actions,
          workspaces: projections.workspaces,
        });

        // Fire-and-forget: notify org members of any critical findings or regressions
        // (respects per-user notification preferences via Brevo)
        const regressionFindings = projections.findings.filter(f => f.change_class === 'regression');
        Promise.all([
          triggerIncidentNotifications({
            userId: user.id,
            domain,
            findings: projections.findings as any,
          }),
          triggerRegressionNotifications({
            userId: user.id,
            domain,
            regressions: regressionFindings as any,
          }),
        ]).catch(() => {});

        send('score', {
          total_findings: projections.findings.length,
          negative: projections.findings.filter(f => f.polarity === 'negative').length,
          positive: projections.findings.filter(f => f.polarity === 'positive').length,
          neutral: projections.findings.filter(f => f.polarity === 'neutral').length,
          total_impact_mid: projections.findings.reduce((s, f) => s + f.impact.midpoint, 0),
          classification: multiPackResult.classification,
          coverage: result.coverage,
        });

        // Bootstrap MCP context so console pages can use it
        // Also persist evidence to PostgreSQL for restart resilience
        const prismaEvidenceStore = new PrismaEvidenceStore(prisma);
        try {
          const server = getMcpServer();
          bootstrapMcpContextSync(server, {
            organization_id: user.id,
            organization_name: '',
            environment_id: environmentId,
            domain: domain.replace(/^https?:\/\//, '').split('/')[0],
            landing_url: domain.startsWith('http') ? domain : `https://${domain}`,
            is_production: process.env.NODE_ENV === 'production',
          }, result.evidence, prismaEvidenceStore);
        } catch {
          // MCP bootstrap is best-effort — analysis still succeeds
          // Still try to persist evidence separately
          prismaEvidenceStore.addMany(result.evidence).catch(() => {});
        }

        // Persist job state
        try {
          const store = getMcpPersistenceStore();
          const jobRecord: AnalysisJobRecord = {
            id: jobId,
            environment_id: environmentId,
            organization_id: user.id,
            status: 'complete',
            progress: 100,
            stages_completed: result.stages_completed,
            created_at: new Date(),
            updated_at: new Date(),
            error: null,
          };
          await store.saveJob(jobRecord);
        } catch {
          // Persistence is best-effort
        }

        send('complete', {
          total_evidence: result.evidence.length,
          total_findings: projections.findings.length,
          duration_ms: result.duration_ms,
          stages: result.stages_completed,
          coverage: result.coverage,
          job_id: jobId,
        });

        completeJob(jobId);
      } catch (err) {
        send('error', {
          message: err instanceof Error ? err.message : 'Analysis failed',
          job_id: jobId,
        });
        failJob(jobId, err instanceof Error ? err.message : 'Analysis failed');
        trackError(err, { endpoint: '/api/analysis/stream', method: 'GET', severity: 'error' }).catch(() => {});
      } finally {
        clearInterval(heartbeat);
        // Persist events to cache for reconnect
        eventCache.set(cacheKey, { events: cachedEvents, timestamp: Date.now() });
        // Clean old caches
        for (const [key, val] of eventCache) {
          if (Date.now() - val.timestamp > CACHE_TTL_MS) eventCache.delete(key);
        }
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
