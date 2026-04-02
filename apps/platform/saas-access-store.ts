import {
  SaasAccessConfig,
  SaasAccessStatus,
  SaasAuthMethod,
  SaasMfaMode,
} from '../../packages/domain';

// ──────────────────────────────────────────────
// SaaS Access Store
//
// Persistence abstraction for SaasAccessConfig.
// One active config per environment (unique constraint).
// Status transitions enforced at store level.
//
// Implementations:
// - InMemorySaasAccessStore (tests / dev)
// - PrismaSaasAccessStore (production — DB-backed)
// ──────────────────────────────────────────────

export interface SaasAccessStoreInput {
  login_url: string;
  email: string | null;
  password_encrypted: string | null;
  auth_method: SaasAuthMethod;
  mfa_mode: SaasMfaMode;
  has_trial: boolean | null;
  requires_seed_data: boolean | null;
  test_account_available: boolean | null;
  activation_goal: string | null;
  primary_upgrade_path: string | null;
}

export interface SaasAccessStore {
  get(environmentId: string): Promise<SaasAccessConfig | null>;
  save(environmentId: string, input: SaasAccessStoreInput): Promise<SaasAccessConfig>;
  updateStatus(environmentId: string, status: SaasAccessStatus, failureReason?: string): Promise<SaasAccessConfig | null>;
  markVerified(environmentId: string): Promise<SaasAccessConfig | null>;
  delete(environmentId: string): Promise<boolean>;
}

// ──────────────────────────────────────────────
// In-Memory Implementation (tests / dev)
// ──────────────────────────────────────────────

export class InMemorySaasAccessStore implements SaasAccessStore {
  private store = new Map<string, SaasAccessConfig>();

  async get(environmentId: string): Promise<SaasAccessConfig | null> {
    return this.store.get(environmentId) || null;
  }

  async save(environmentId: string, input: SaasAccessStoreInput): Promise<SaasAccessConfig> {
    const existing = this.store.get(environmentId);
    const now = new Date();

    const config: SaasAccessConfig = {
      id: existing?.id || `saas_access:${environmentId}`,
      environment_id: environmentId,
      login_url: input.login_url,
      email: input.email,
      password_encrypted: input.password_encrypted,
      auth_method: input.auth_method,
      mfa_mode: input.mfa_mode,
      has_trial: input.has_trial,
      requires_seed_data: input.requires_seed_data,
      test_account_available: input.test_account_available,
      activation_goal: input.activation_goal,
      primary_upgrade_path: input.primary_upgrade_path,
      last_verified_at: existing?.last_verified_at || null,
      last_failure_reason: existing?.last_failure_reason || null,
      status: input.login_url ? 'configured' : 'unconfigured',
      created_at: existing?.created_at || now,
      updated_at: now,
    };

    this.store.set(environmentId, config);
    return config;
  }

  async updateStatus(environmentId: string, status: SaasAccessStatus, failureReason?: string): Promise<SaasAccessConfig | null> {
    const config = this.store.get(environmentId);
    if (!config) return null;

    const updated: SaasAccessConfig = {
      ...config,
      status,
      last_failure_reason: failureReason ?? config.last_failure_reason,
      updated_at: new Date(),
    };

    if (status === 'verified') {
      updated.last_verified_at = new Date();
      updated.last_failure_reason = null;
    }

    this.store.set(environmentId, updated);
    return updated;
  }

  async markVerified(environmentId: string): Promise<SaasAccessConfig | null> {
    return this.updateStatus(environmentId, 'verified');
  }

  async delete(environmentId: string): Promise<boolean> {
    return this.store.delete(environmentId);
  }

  /** Reset for tests */
  reset(): void {
    this.store.clear();
  }
}

// ──────────────────────────────────────────────
// Prisma Implementation (production)
// ──────────────────────────────────────────────

export class PrismaSaasAccessStore implements SaasAccessStore {
  constructor(private prisma: any) {}

  async get(environmentId: string): Promise<SaasAccessConfig | null> {
    const row = await this.prisma.saasAccessConfig.findUnique({
      where: { environmentId },
    });
    if (!row) return null;
    return this.toConfig(row);
  }

  async save(environmentId: string, input: SaasAccessStoreInput): Promise<SaasAccessConfig> {
    const status: SaasAccessStatus = input.login_url ? 'configured' : 'unconfigured';

    const row = await this.prisma.saasAccessConfig.upsert({
      where: { environmentId },
      create: {
        environmentId,
        loginUrl: input.login_url,
        email: input.email,
        passwordEncrypted: input.password_encrypted,
        authMethod: input.auth_method,
        mfaMode: input.mfa_mode,
        hasTrial: input.has_trial,
        requiresSeedData: input.requires_seed_data,
        testAccountAvailable: input.test_account_available,
        activationGoal: input.activation_goal,
        primaryUpgradePath: input.primary_upgrade_path,
        status,
      },
      update: {
        loginUrl: input.login_url,
        email: input.email,
        passwordEncrypted: input.password_encrypted,
        authMethod: input.auth_method,
        mfaMode: input.mfa_mode,
        hasTrial: input.has_trial,
        requiresSeedData: input.requires_seed_data,
        testAccountAvailable: input.test_account_available,
        activationGoal: input.activation_goal,
        primaryUpgradePath: input.primary_upgrade_path,
        status,
      },
    });

    return this.toConfig(row);
  }

  async updateStatus(environmentId: string, status: SaasAccessStatus, failureReason?: string): Promise<SaasAccessConfig | null> {
    try {
      const updateData: any = { status };

      if (status === 'verified') {
        updateData.lastVerifiedAt = new Date();
        updateData.lastFailureReason = null;
      } else if (failureReason) {
        updateData.lastFailureReason = failureReason;
      }

      const row = await this.prisma.saasAccessConfig.update({
        where: { environmentId },
        data: updateData,
      });
      return this.toConfig(row);
    } catch {
      return null; // record not found
    }
  }

  async markVerified(environmentId: string): Promise<SaasAccessConfig | null> {
    return this.updateStatus(environmentId, 'verified');
  }

  async delete(environmentId: string): Promise<boolean> {
    try {
      await this.prisma.saasAccessConfig.delete({
        where: { environmentId },
      });
      return true;
    } catch {
      return false;
    }
  }

  /** Map Prisma row → domain SaasAccessConfig */
  private toConfig(row: any): SaasAccessConfig {
    return {
      id: row.id,
      environment_id: row.environmentId,
      login_url: row.loginUrl,
      email: row.email,
      password_encrypted: row.passwordEncrypted,
      auth_method: row.authMethod as SaasAuthMethod,
      mfa_mode: row.mfaMode as SaasMfaMode,
      has_trial: row.hasTrial,
      requires_seed_data: row.requiresSeedData,
      test_account_available: row.testAccountAvailable,
      activation_goal: row.activationGoal,
      primary_upgrade_path: row.primaryUpgradePath,
      last_verified_at: row.lastVerifiedAt,
      last_failure_reason: row.lastFailureReason,
      status: row.status as SaasAccessStatus,
      created_at: row.createdAt,
      updated_at: row.updatedAt,
    };
  }
}

// ──────────────────────────────────────────────
// Singleton accessor
// ──────────────────────────────────────────────

let activeSaasAccessStore: SaasAccessStore = new InMemorySaasAccessStore();

export function getSaasAccessStore(): SaasAccessStore {
  return activeSaasAccessStore;
}

export function setSaasAccessStore(store: SaasAccessStore): void {
  activeSaasAccessStore = store;
}

export function resetSaasAccessStore(): void {
  activeSaasAccessStore = new InMemorySaasAccessStore();
}
