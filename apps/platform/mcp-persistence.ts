// ──────────────────────────────────────────────
// MCP Persistence Models
//
// Persistent models needed for:
//   - Production state continuity
//   - Observability
//   - Deploy safety
//
// Models:
//   McpPromptEvent — prompt gate evaluations
//   McpSessionRecord — session summaries
//   McpSuggestionClick — suggestion interaction
//   PlaybookRunRecord — playbook execution
//   AnalysisJobRecord — job state (persistent)
//
// Only what is necessary — no over-modeling.
// ──────────────────────────────────────────────

// ──────────────────────────────────────────────
// McpPromptEvent — tracks prompt gate evaluations
// ──────────────────────────────────────────────

export interface McpPromptEvent {
  id: string;
  org_id: string;
  timestamp: Date;
  input_hash: string;     // hash of input, not the input itself
  quality: 'good' | 'weak' | 'misfire';
  rewrite_offered: boolean;
  rewrite_accepted: boolean | null;
  input_length: number;
}

// ──────────────────────────────────────────────
// McpSessionRecord — session summary for observability
// ──────────────────────────────────────────────

export interface McpSessionRecord {
  id: string;
  org_id: string;
  started_at: Date;
  ended_at: Date | null;
  queries_used: number;
  playbook_id: string | null;
  prompt_rewrites: number;
  chain_depth: number;
  plan: string;
}

// ──────────────────────────────────────────────
// McpSuggestionClick — which suggestions users click
// ──────────────────────────────────────────────

export interface McpSuggestionClick {
  id: string;
  org_id: string;
  timestamp: Date;
  suggestion_type: 'question' | 'action' | 'navigation' | 'chain' | 'playbook';
  suggestion_text: string;
}

// ──────────────────────────────────────────────
// PlaybookRunRecord — playbook execution tracking
// ──────────────────────────────────────────────

export interface PlaybookRunRecord {
  id: string;
  org_id: string;
  playbook_id: string;
  started_at: Date;
  completed_at: Date | null;
  steps_completed: number;
  total_steps: number;
  status: 'running' | 'completed' | 'abandoned';
}

// ──────────────────────────────────────────────
// AnalysisJobRecord — persistent job state
// ──────────────────────────────────────────────

export interface AnalysisJobRecord {
  id: string;
  environment_id: string;
  organization_id: string;
  status: string;
  progress: number;
  stages_completed: string[];
  created_at: Date;
  updated_at: Date;
  error: string | null;
}

// ──────────────────────────────────────────────
// Persistent Store Interface
// ──────────────────────────────────────────────

export interface McpPersistenceStore {
  // Prompt events
  savePromptEvent(event: McpPromptEvent): Promise<void>;
  getPromptEvents(orgId: string, limit?: number): Promise<McpPromptEvent[]>;

  // Sessions
  saveSession(session: McpSessionRecord): Promise<void>;
  getSessions(orgId: string, limit?: number): Promise<McpSessionRecord[]>;

  // Suggestion clicks
  saveSuggestionClick(click: McpSuggestionClick): Promise<void>;
  getSuggestionClicks(orgId: string, limit?: number): Promise<McpSuggestionClick[]>;

  // Playbook runs
  savePlaybookRun(run: PlaybookRunRecord): Promise<void>;
  getPlaybookRuns(orgId?: string, limit?: number): Promise<PlaybookRunRecord[]>;

  // Analysis jobs
  saveJob(job: AnalysisJobRecord): Promise<void>;
  getJob(jobId: string): Promise<AnalysisJobRecord | null>;
  getJobForEnvironment(envId: string): Promise<AnalysisJobRecord | null>;
}

// ──────────────────────────────────────────────
// In-Memory Implementation
// ──────────────────────────────────────────────

export class InMemoryMcpPersistenceStore implements McpPersistenceStore {
  private promptEvents: McpPromptEvent[] = [];
  private sessions: McpSessionRecord[] = [];
  private clicks: McpSuggestionClick[] = [];
  private playbookRuns: PlaybookRunRecord[] = [];
  private jobs = new Map<string, AnalysisJobRecord>();
  private envJobs = new Map<string, string>();

  async savePromptEvent(event: McpPromptEvent): Promise<void> {
    this.promptEvents.push(event);
    if (this.promptEvents.length > 5000) this.promptEvents.splice(0, this.promptEvents.length - 5000);
  }

  async getPromptEvents(orgId: string, limit = 100): Promise<McpPromptEvent[]> {
    return this.promptEvents.filter(e => e.org_id === orgId).slice(-limit);
  }

  async saveSession(session: McpSessionRecord): Promise<void> {
    this.sessions.push(session);
    if (this.sessions.length > 2000) this.sessions.splice(0, this.sessions.length - 2000);
  }

  async getSessions(orgId: string, limit = 100): Promise<McpSessionRecord[]> {
    return this.sessions.filter(s => s.org_id === orgId).slice(-limit);
  }

  async saveSuggestionClick(click: McpSuggestionClick): Promise<void> {
    this.clicks.push(click);
    if (this.clicks.length > 5000) this.clicks.splice(0, this.clicks.length - 5000);
  }

  async getSuggestionClicks(orgId: string, limit = 100): Promise<McpSuggestionClick[]> {
    return this.clicks.filter(c => c.org_id === orgId).slice(-limit);
  }

  async savePlaybookRun(run: PlaybookRunRecord): Promise<void> {
    this.playbookRuns.push(run);
    if (this.playbookRuns.length > 1000) this.playbookRuns.splice(0, this.playbookRuns.length - 1000);
  }

  async getPlaybookRuns(orgId?: string, limit = 100): Promise<PlaybookRunRecord[]> {
    const filtered = orgId ? this.playbookRuns.filter(r => r.org_id === orgId) : this.playbookRuns;
    return filtered.slice(-limit);
  }

  async saveJob(job: AnalysisJobRecord): Promise<void> {
    this.jobs.set(job.id, job);
    this.envJobs.set(job.environment_id, job.id);
  }

  async getJob(jobId: string): Promise<AnalysisJobRecord | null> {
    return this.jobs.get(jobId) || null;
  }

  async getJobForEnvironment(envId: string): Promise<AnalysisJobRecord | null> {
    const jobId = this.envJobs.get(envId);
    if (!jobId) return null;
    return this.jobs.get(jobId) || null;
  }

  clear(): void {
    this.promptEvents.length = 0;
    this.sessions.length = 0;
    this.clicks.length = 0;
    this.playbookRuns.length = 0;
    this.jobs.clear();
    this.envJobs.clear();
  }
}

// ──────────────────────────────────────────────
// Prisma Implementation
// ──────────────────────────────────────────────

export class PrismaMcpPersistenceStore implements McpPersistenceStore {
  constructor(private prisma: any) {}

  async savePromptEvent(event: McpPromptEvent): Promise<void> {
    await this.prisma.mcpPromptEvent.create({ data: {
      id: event.id, orgId: event.org_id, inputHash: event.input_hash,
      quality: event.quality, rewriteOffered: event.rewrite_offered,
      rewriteAccepted: event.rewrite_accepted, inputLength: event.input_length,
    } }).catch(() => {});
  }

  async getPromptEvents(orgId: string, limit = 100): Promise<McpPromptEvent[]> {
    const rows = await this.prisma.mcpPromptEvent.findMany({
      where: { orgId }, orderBy: { createdAt: 'desc' }, take: limit,
    });
    return rows.map((r: any) => ({
      id: r.id, org_id: r.orgId, timestamp: r.createdAt, input_hash: r.inputHash,
      quality: r.quality, rewrite_offered: r.rewriteOffered,
      rewrite_accepted: r.rewriteAccepted, input_length: r.inputLength,
    }));
  }

  async saveSession(session: McpSessionRecord): Promise<void> {
    await this.prisma.mcpSession.create({ data: {
      id: session.id, orgId: session.org_id, startedAt: session.started_at,
      endedAt: session.ended_at, queriesUsed: session.queries_used,
      playbookId: session.playbook_id, promptRewrites: session.prompt_rewrites,
      chainDepth: session.chain_depth, plan: session.plan,
    } }).catch(() => {});
  }

  async getSessions(orgId: string, limit = 100): Promise<McpSessionRecord[]> {
    const rows = await this.prisma.mcpSession.findMany({
      where: { orgId }, orderBy: { startedAt: 'desc' }, take: limit,
    });
    return rows.map((r: any) => ({
      id: r.id, org_id: r.orgId, started_at: r.startedAt, ended_at: r.endedAt,
      queries_used: r.queriesUsed, playbook_id: r.playbookId,
      prompt_rewrites: r.promptRewrites, chain_depth: r.chainDepth, plan: r.plan,
    }));
  }

  async saveSuggestionClick(click: McpSuggestionClick): Promise<void> {
    await this.prisma.mcpSuggestionClick.create({ data: {
      id: click.id, orgId: click.org_id, suggestionType: click.suggestion_type,
      suggestionText: click.suggestion_text,
    } }).catch(() => {});
  }

  async getSuggestionClicks(orgId: string, limit = 100): Promise<McpSuggestionClick[]> {
    const rows = await this.prisma.mcpSuggestionClick.findMany({
      where: { orgId }, orderBy: { createdAt: 'desc' }, take: limit,
    });
    return rows.map((r: any) => ({
      id: r.id, org_id: r.orgId, timestamp: r.createdAt,
      suggestion_type: r.suggestionType, suggestion_text: r.suggestionText,
    }));
  }

  async savePlaybookRun(run: PlaybookRunRecord): Promise<void> {
    await this.prisma.playbookRun.create({ data: {
      id: run.id, orgId: run.org_id, playbookId: run.playbook_id,
      startedAt: run.started_at, completedAt: run.completed_at,
      stepsCompleted: run.steps_completed, totalSteps: run.total_steps,
      status: run.status,
    } }).catch(() => {});
  }

  async getPlaybookRuns(orgId?: string, limit = 100): Promise<PlaybookRunRecord[]> {
    const where = orgId ? { orgId } : {};
    const rows = await this.prisma.playbookRun.findMany({
      where, orderBy: { startedAt: 'desc' }, take: limit,
    });
    return rows.map((r: any) => ({
      id: r.id, org_id: r.orgId, playbook_id: r.playbookId,
      started_at: r.startedAt, completed_at: r.completedAt,
      steps_completed: r.stepsCompleted, total_steps: r.totalSteps,
      status: r.status,
    }));
  }

  async saveJob(job: AnalysisJobRecord): Promise<void> {
    await this.prisma.analysisJob.upsert({
      where: { id: job.id },
      create: {
        id: job.id, environmentId: job.environment_id, organizationId: job.organization_id,
        status: job.status, progress: job.progress,
        stagesCompleted: JSON.stringify(job.stages_completed),
        error: job.error,
      },
      update: {
        status: job.status, progress: job.progress,
        stagesCompleted: JSON.stringify(job.stages_completed),
        error: job.error,
      },
    }).catch(() => {});
  }

  async getJob(jobId: string): Promise<AnalysisJobRecord | null> {
    const row = await this.prisma.analysisJob.findUnique({ where: { id: jobId } });
    if (!row) return null;
    return {
      id: row.id, environment_id: row.environmentId, organization_id: row.organizationId,
      status: row.status, progress: row.progress,
      stages_completed: JSON.parse(row.stagesCompleted || '[]'),
      created_at: row.createdAt, updated_at: row.updatedAt, error: row.error,
    };
  }

  async getJobForEnvironment(envId: string): Promise<AnalysisJobRecord | null> {
    const row = await this.prisma.analysisJob.findFirst({
      where: { environmentId: envId, status: { in: ['queued', 'running'] } },
      orderBy: { createdAt: 'desc' },
    });
    if (!row) return null;
    return {
      id: row.id, environment_id: row.environmentId, organization_id: row.organizationId,
      status: row.status, progress: row.progress,
      stages_completed: JSON.parse(row.stagesCompleted || '[]'),
      created_at: row.createdAt, updated_at: row.updatedAt, error: row.error,
    };
  }
}

// ──────────────────────────────────────────────
// Active Store Singleton
// ──────────────────────────────────────────────

let activeStore: McpPersistenceStore = new InMemoryMcpPersistenceStore();

export function setMcpPersistenceStore(store: McpPersistenceStore): void {
  activeStore = store;
}

export function getMcpPersistenceStore(): McpPersistenceStore {
  return activeStore;
}

export function resetMcpPersistenceStore(): void {
  activeStore = new InMemoryMcpPersistenceStore();
}
