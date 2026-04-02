import type { AnalysisJob, JobStatus } from "../../packages/plans";
import { getRedis, safeRedisCall } from "../../src/libs/redis";
import {
  enqueueJob as memEnqueue,
  startJob as memStart,
  updateJobProgress as memUpdateProgress,
  completeJob as memComplete,
  failJob as memFail,
  markPartial as memMarkPartial,
  retryJob as memRetry,
  getJob as memGetJob,
  getJobForEnvironment as memGetJobForEnv,
  getAllJobs as memGetAllJobs,
  getRunningJobs as memGetRunningJobs,
  resetJobQueue as memReset,
} from "./job-queue";
import type { EnqueueResult } from "./job-queue";

// ──────────────────────────────────────────────
// Redis-Backed Job Queue
//
// Same interface as the in-memory job queue, but
// persists state in Redis. Falls back to in-memory
// automatically if Redis is unavailable.
//
// Key schema:
//   vestigio:job:{id}          — Hash with job fields
//   vestigio:job:queue         — List of queued job IDs (FIFO)
//   vestigio:job:env:{envId}   — String with active job ID for env
//   vestigio:job:all           — Set of all job IDs
//   vestigio:job:lock:{envId}  — Lock key (SET NX EX)
//
// Job hashes expire after 1 hour (3600s).
// ──────────────────────────────────────────────

const PREFIX = "vestigio:job";
const JOB_TTL = 3600; // 1 hour
const LOCK_TTL = 300; // 5 minutes
const MAX_CONCURRENT_JOBS = 5;

let jobIdCounter = 0;
function nextJobId(): string {
  return `job_${Date.now()}_${++jobIdCounter}`;
}

// ──────────────────────────────────────────────
// Redis Helpers
// ──────────────────────────────────────────────

function jobKey(id: string): string {
  return `${PREFIX}:${id}`;
}
function envKey(envId: string): string {
  return `${PREFIX}:env:${envId}`;
}
function lockKey(envId: string): string {
  return `${PREFIX}:lock:${envId}`;
}
const QUEUE_KEY = `${PREFIX}:queue`;
const ALL_JOBS_KEY = `${PREFIX}:all`;

function serializeJob(job: AnalysisJob): Record<string, string> {
  return {
    id: job.id,
    environment_id: job.environment_id,
    organization_id: job.organization_id,
    status: job.status,
    progress: String(job.progress),
    stages_completed: JSON.stringify(job.stages_completed),
    created_at: job.created_at.toISOString(),
    updated_at: job.updated_at.toISOString(),
    error: job.error || "",
  };
}

function deserializeJob(data: Record<string, string>): AnalysisJob | null {
  if (!data || !data.id) return null;
  const job: AnalysisJob = {
    id: data.id,
    environment_id: data.environment_id,
    organization_id: data.organization_id,
    status: data.status as JobStatus,
    progress: parseInt(data.progress, 10) || 0,
    stages_completed: JSON.parse(data.stages_completed || "[]"),
    created_at: new Date(data.created_at),
    updated_at: new Date(data.updated_at),
  };
  if (data.error) {
    job.error = data.error;
  }
  return job;
}

function useRedis(): boolean {
  return !!getRedis();
}

// ──────────────────────────────────────────────
// Enqueue
// ──────────────────────────────────────────────

export async function redisEnqueueJob(
  environmentId: string,
  organizationId: string,
): Promise<EnqueueResult> {
  if (!useRedis()) {
    return memEnqueue(environmentId, organizationId);
  }

  const redis = getRedis()!;
  try {
    // Check for existing active job for this environment
    const existingJobId = await redis.get(envKey(environmentId));
    if (existingJobId) {
      const existingData = await redis.hgetall(jobKey(existingJobId));
      const existing = deserializeJob(existingData);
      if (
        existing &&
        (existing.status === "queued" || existing.status === "running")
      ) {
        return {
          enqueued: false,
          job: existing,
          reason: `An analysis job is already ${existing.status} for this environment.`,
        };
      }
    }

    // Try to acquire lock to prevent race conditions
    const lockAcquired = await redis.set(
      lockKey(environmentId),
      "1",
      "EX",
      LOCK_TTL,
      "NX",
    );
    if (!lockAcquired) {
      return {
        enqueued: false,
        job: null,
        reason:
          "Another job is being created for this environment. Please try again.",
      };
    }

    const job: AnalysisJob = {
      id: nextJobId(),
      environment_id: environmentId,
      organization_id: organizationId,
      status: "queued",
      progress: 0,
      stages_completed: [],
      created_at: new Date(),
      updated_at: new Date(),
    };

    // Store job in Redis using pipeline
    const pipe = redis.pipeline();
    pipe.hmset(jobKey(job.id), serializeJob(job));
    pipe.expire(jobKey(job.id), JOB_TTL);
    pipe.set(envKey(environmentId), job.id, "EX", JOB_TTL);
    pipe.rpush(QUEUE_KEY, job.id);
    pipe.sadd(ALL_JOBS_KEY, job.id);
    pipe.del(lockKey(environmentId));
    await pipe.exec();

    return { enqueued: true, job, reason: null };
  } catch (err) {
    console.warn(
      `[RedisJobQueue] enqueue failed, falling back to in-memory: ${err instanceof Error ? err.message : "unknown"}`,
    );
    return memEnqueue(environmentId, organizationId);
  }
}

// ──────────────────────────────────────────────
// Job Lifecycle
// ──────────────────────────────────────────────

export async function redisStartJob(jobId: string): Promise<boolean> {
  if (!useRedis()) return memStart(jobId);

  const redis = getRedis()!;
  try {
    const data = await redis.hgetall(jobKey(jobId));
    const job = deserializeJob(data);
    if (!job || job.status !== "queued") return false;

    // Count active (running) jobs
    const allJobIds = await redis.smembers(ALL_JOBS_KEY);
    let activeCount = 0;
    for (const id of allJobIds) {
      const status = await redis.hget(jobKey(id), "status");
      if (status === "running") activeCount++;
    }
    if (activeCount >= MAX_CONCURRENT_JOBS) return false;

    await redis.hmset(jobKey(jobId), {
      status: "running",
      updated_at: new Date().toISOString(),
    });
    await redis.expire(jobKey(jobId), JOB_TTL);
    return true;
  } catch {
    return memStart(jobId);
  }
}

export async function redisUpdateJobProgress(
  jobId: string,
  progress: number,
  stage?: string,
): Promise<boolean> {
  if (!useRedis()) return memUpdateProgress(jobId, progress, stage);

  const redis = getRedis()!;
  try {
    const data = await redis.hgetall(jobKey(jobId));
    const job = deserializeJob(data);
    if (!job || job.status !== "running") return false;

    const clampedProgress = Math.min(100, Math.max(0, progress));
    const stages = job.stages_completed;
    if (stage && !stages.includes(stage)) {
      stages.push(stage);
    }

    await redis.hmset(jobKey(jobId), {
      progress: String(clampedProgress),
      stages_completed: JSON.stringify(stages),
      updated_at: new Date().toISOString(),
    });
    await redis.expire(jobKey(jobId), JOB_TTL);
    return true;
  } catch {
    return memUpdateProgress(jobId, progress, stage);
  }
}

export async function redisCompleteJob(jobId: string): Promise<boolean> {
  if (!useRedis()) return memComplete(jobId);

  const redis = getRedis()!;
  try {
    const data = await redis.hgetall(jobKey(jobId));
    const job = deserializeJob(data);
    if (!job) return false;

    await redis.hmset(jobKey(jobId), {
      status: "complete",
      progress: "100",
      updated_at: new Date().toISOString(),
    });
    await redis.expire(jobKey(jobId), JOB_TTL);
    await redis.del(envKey(job.environment_id));

    // Promote next queued job
    await promoteNextQueued();
    return true;
  } catch {
    return memComplete(jobId);
  }
}

export async function redisFailJob(
  jobId: string,
  error: string,
): Promise<boolean> {
  if (!useRedis()) return memFail(jobId, error);

  const redis = getRedis()!;
  try {
    const data = await redis.hgetall(jobKey(jobId));
    const job = deserializeJob(data);
    if (!job) return false;

    await redis.hmset(jobKey(jobId), {
      status: "failed",
      error,
      updated_at: new Date().toISOString(),
    });
    await redis.expire(jobKey(jobId), JOB_TTL);
    await redis.del(envKey(job.environment_id));

    await promoteNextQueued();
    return true;
  } catch {
    return memFail(jobId, error);
  }
}

export async function redisMarkPartial(jobId: string): Promise<boolean> {
  if (!useRedis()) return memMarkPartial(jobId);

  const redis = getRedis()!;
  try {
    const status = await redis.hget(jobKey(jobId), "status");
    if (status !== "running") return false;

    await redis.hmset(jobKey(jobId), {
      status: "partial",
      updated_at: new Date().toISOString(),
    });
    await redis.expire(jobKey(jobId), JOB_TTL);
    return true;
  } catch {
    return memMarkPartial(jobId);
  }
}

// ──────────────────────────────────────────────
// Retry
// ──────────────────────────────────────────────

export async function redisRetryJob(jobId: string): Promise<EnqueueResult> {
  if (!useRedis()) return memRetry(jobId);

  const redis = getRedis()!;
  try {
    const data = await redis.hgetall(jobKey(jobId));
    const job = deserializeJob(data);
    if (!job || (job.status !== "failed" && job.status !== "partial")) {
      return {
        enqueued: false,
        job: null,
        reason: "Job cannot be retried (not failed/partial).",
      };
    }

    const newJob: AnalysisJob = {
      id: nextJobId(),
      environment_id: job.environment_id,
      organization_id: job.organization_id,
      status: "queued",
      progress: job.progress,
      stages_completed: [...job.stages_completed],
      created_at: new Date(),
      updated_at: new Date(),
    };

    const pipe = redis.pipeline();
    pipe.hmset(jobKey(newJob.id), serializeJob(newJob));
    pipe.expire(jobKey(newJob.id), JOB_TTL);
    pipe.set(envKey(newJob.environment_id), newJob.id, "EX", JOB_TTL);
    pipe.rpush(QUEUE_KEY, newJob.id);
    pipe.sadd(ALL_JOBS_KEY, newJob.id);
    await pipe.exec();

    return { enqueued: true, job: newJob, reason: null };
  } catch {
    return memRetry(jobId);
  }
}

// ──────────────────────────────────────────────
// Queue Promotion
// ──────────────────────────────────────────────

async function promoteNextQueued(): Promise<void> {
  const redis = getRedis();
  if (!redis) return;

  try {
    // Count running jobs
    const allJobIds = await redis.smembers(ALL_JOBS_KEY);
    let activeCount = 0;
    for (const id of allJobIds) {
      const status = await redis.hget(jobKey(id), "status");
      if (status === "running") activeCount++;
    }
    if (activeCount >= MAX_CONCURRENT_JOBS) return;

    // Pop from queue and promote
    const nextId = await redis.lpop(QUEUE_KEY);
    if (!nextId) return;

    const status = await redis.hget(jobKey(nextId), "status");
    if (status === "queued") {
      await redis.hmset(jobKey(nextId), {
        status: "running",
        updated_at: new Date().toISOString(),
      });
      await redis.expire(jobKey(nextId), JOB_TTL);
    }
  } catch {
    // Promotion is best-effort
  }
}

// ──────────────────────────────────────────────
// Query
// ──────────────────────────────────────────────

export async function redisGetJob(jobId: string): Promise<AnalysisJob | null> {
  if (!useRedis()) return memGetJob(jobId);

  const redis = getRedis()!;
  try {
    const data = await redis.hgetall(jobKey(jobId));
    return deserializeJob(data);
  } catch {
    return memGetJob(jobId);
  }
}

export async function redisGetJobForEnvironment(
  environmentId: string,
): Promise<AnalysisJob | null> {
  if (!useRedis()) return memGetJobForEnv(environmentId);

  const redis = getRedis()!;
  try {
    const jid = await redis.get(envKey(environmentId));
    if (!jid) return null;
    const data = await redis.hgetall(jobKey(jid));
    return deserializeJob(data);
  } catch {
    return memGetJobForEnv(environmentId);
  }
}

export async function redisGetAllJobs(): Promise<AnalysisJob[]> {
  if (!useRedis()) return memGetAllJobs();

  const redis = getRedis()!;
  try {
    const allIds = await redis.smembers(ALL_JOBS_KEY);
    const jobs: AnalysisJob[] = [];
    for (const id of allIds) {
      const data = await redis.hgetall(jobKey(id));
      const job = deserializeJob(data);
      if (job) jobs.push(job);
    }
    return jobs.sort(
      (a, b) => b.created_at.getTime() - a.created_at.getTime(),
    );
  } catch {
    return memGetAllJobs();
  }
}

export async function redisGetRunningJobs(): Promise<AnalysisJob[]> {
  if (!useRedis()) return memGetRunningJobs();

  const redis = getRedis()!;
  try {
    const allIds = await redis.smembers(ALL_JOBS_KEY);
    const running: AnalysisJob[] = [];
    for (const id of allIds) {
      const data = await redis.hgetall(jobKey(id));
      const job = deserializeJob(data);
      if (job && job.status === "running") running.push(job);
    }
    return running;
  } catch {
    return memGetRunningJobs();
  }
}

// ──────────────────────────────────────────────
// Reset (for testing)
// ──────────────────────────────────────────────

export async function redisResetJobQueue(): Promise<void> {
  memReset();

  const redis = getRedis();
  if (!redis) return;

  try {
    const allIds = await redis.smembers(ALL_JOBS_KEY);
    const pipe = redis.pipeline();
    for (const id of allIds) {
      pipe.del(jobKey(id));
    }
    pipe.del(ALL_JOBS_KEY);
    pipe.del(QUEUE_KEY);
    await pipe.exec();
  } catch {
    // Reset is best-effort for Redis
  }

  jobIdCounter = 0;
}

// ──────────────────────────────────────────────
// Export convenience: is this queue Redis-backed?
// ──────────────────────────────────────────────

export function isRedisJobQueue(): boolean {
  return useRedis();
}
