import { AnalysisJob, JobStatus } from '../../packages/plans';

// ──────────────────────────────────────────────
// Analysis Job Queue — Execution Orchestration
//
// Ensures:
//   - 1 active job per environment
//   - Global concurrency limit
//   - Retry failed stages (not full restart)
//   - Progress tracking
//
// In-memory queue. Production: backed by DB.
// ──────────────────────────────────────────────

const MAX_CONCURRENT_JOBS = 5;

let jobIdCounter = 0;
function nextJobId(): string {
  return `job_${Date.now()}_${++jobIdCounter}`;
}

// In-memory stores
const jobs = new Map<string, AnalysisJob>();
const envActiveJobs = new Map<string, string>(); // environmentId → jobId

// ──────────────────────────────────────────────
// Create / Enqueue
// ──────────────────────────────────────────────

export interface EnqueueResult {
  enqueued: boolean;
  job: AnalysisJob | null;
  reason: string | null;
}

export function enqueueJob(environmentId: string, organizationId: string): EnqueueResult {
  // Check: 1 active job per environment
  const existingJobId = envActiveJobs.get(environmentId);
  if (existingJobId) {
    const existing = jobs.get(existingJobId);
    if (existing && (existing.status === 'queued' || existing.status === 'running')) {
      return {
        enqueued: false,
        job: existing,
        reason: `An analysis job is already ${existing.status} for this environment.`,
      };
    }
  }

  // Check global concurrency
  const activeCount = Array.from(jobs.values()).filter(
    j => j.status === 'running',
  ).length;
  const status: JobStatus = activeCount >= MAX_CONCURRENT_JOBS ? 'queued' : 'queued';

  const job: AnalysisJob = {
    id: nextJobId(),
    environment_id: environmentId,
    organization_id: organizationId,
    status,
    progress: 0,
    stages_completed: [],
    created_at: new Date(),
    updated_at: new Date(),
  };

  jobs.set(job.id, job);
  envActiveJobs.set(environmentId, job.id);

  return { enqueued: true, job, reason: null };
}

// ──────────────────────────────────────────────
// Job Lifecycle
// ──────────────────────────────────────────────

export function startJob(jobId: string): boolean {
  const job = jobs.get(jobId);
  if (!job || job.status !== 'queued') return false;

  const activeCount = Array.from(jobs.values()).filter(j => j.status === 'running').length;
  if (activeCount >= MAX_CONCURRENT_JOBS) return false;

  job.status = 'running';
  job.updated_at = new Date();
  return true;
}

export function updateJobProgress(jobId: string, progress: number, stage?: string): boolean {
  const job = jobs.get(jobId);
  if (!job || job.status !== 'running') return false;
  job.progress = Math.min(100, Math.max(0, progress));
  if (stage && !job.stages_completed.includes(stage)) {
    job.stages_completed.push(stage);
  }
  job.updated_at = new Date();
  return true;
}

export function completeJob(jobId: string): boolean {
  const job = jobs.get(jobId);
  if (!job) return false;
  job.status = 'complete';
  job.progress = 100;
  job.updated_at = new Date();
  envActiveJobs.delete(job.environment_id);
  promoteNextQueued();
  return true;
}

export function failJob(jobId: string, error: string): boolean {
  const job = jobs.get(jobId);
  if (!job) return false;
  job.status = 'failed';
  job.error = error;
  job.updated_at = new Date();
  envActiveJobs.delete(job.environment_id);
  promoteNextQueued();
  return true;
}

export function markPartial(jobId: string): boolean {
  const job = jobs.get(jobId);
  if (!job || job.status !== 'running') return false;
  job.status = 'partial';
  job.updated_at = new Date();
  return true;
}

// ──────────────────────────────────────────────
// Retry — resumes from last completed stage
// ──────────────────────────────────────────────

export function retryJob(jobId: string): EnqueueResult {
  const job = jobs.get(jobId);
  if (!job || (job.status !== 'failed' && job.status !== 'partial')) {
    return { enqueued: false, job: null, reason: 'Job cannot be retried (not failed/partial).' };
  }

  // Create new job that carries forward completed stages
  const newJob: AnalysisJob = {
    id: nextJobId(),
    environment_id: job.environment_id,
    organization_id: job.organization_id,
    status: 'queued',
    progress: job.progress,
    stages_completed: [...job.stages_completed],
    created_at: new Date(),
    updated_at: new Date(),
  };

  jobs.set(newJob.id, newJob);
  envActiveJobs.set(newJob.environment_id, newJob.id);

  return { enqueued: true, job: newJob, reason: null };
}

// ──────────────────────────────────────────────
// Queue promotion — start next queued job when slot opens
// ──────────────────────────────────────────────

function promoteNextQueued(): void {
  const activeCount = Array.from(jobs.values()).filter(j => j.status === 'running').length;
  if (activeCount >= MAX_CONCURRENT_JOBS) return;

  const queued = Array.from(jobs.values())
    .filter(j => j.status === 'queued')
    .sort((a, b) => a.created_at.getTime() - b.created_at.getTime());

  for (const job of queued) {
    if (activeCount + 1 > MAX_CONCURRENT_JOBS) break;
    job.status = 'running';
    job.updated_at = new Date();
  }
}

// ──────────────────────────────────────────────
// Query
// ──────────────────────────────────────────────

export function getJob(jobId: string): AnalysisJob | null {
  return jobs.get(jobId) || null;
}

export function getJobForEnvironment(environmentId: string): AnalysisJob | null {
  const jobId = envActiveJobs.get(environmentId);
  if (!jobId) return null;
  return jobs.get(jobId) || null;
}

export function getAllJobs(): AnalysisJob[] {
  return Array.from(jobs.values()).sort(
    (a, b) => b.created_at.getTime() - a.created_at.getTime(),
  );
}

export function getRunningJobs(): AnalysisJob[] {
  return Array.from(jobs.values()).filter(j => j.status === 'running');
}

// ──────────────────────────────────────────────
// Reset (for testing)
// ──────────────────────────────────────────────

export function resetJobQueue(): void {
  jobs.clear();
  envActiveJobs.clear();
  jobIdCounter = 0;
}
