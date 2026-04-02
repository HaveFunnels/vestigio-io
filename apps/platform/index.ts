export { validateEnv, enforceEnv, isProduction } from './env-validation';
export { initializeStores, assertStoresReady, validateStoreConfiguration, resetStoreEnforcement } from './store-enforcement';
export { vestigioStartup, resetStartup } from './startup';
export {
  evaluateSaasPrerequisites,
  isSaasEnvironment,
  formatPrerequisiteSummary,
  type SaasPrerequisiteState,
  type SaasPrerequisiteStatus,
  type SaasMissingItem,
} from './saas-prerequisites';
export {
  getSaasAccessStore,
  setSaasAccessStore,
  resetSaasAccessStore,
  InMemorySaasAccessStore,
  PrismaSaasAccessStore,
  type SaasAccessStore,
  type SaasAccessStoreInput,
} from './saas-access-store';
export {
  encryptSecret,
  decryptSecret,
  isEncrypted,
  isProductionEncryption,
  enforceProductionSecrets,
} from './secret-service';
export {
  logAuthEvent,
  getAuthLogs,
  getAuthLogsByCorrelation,
  createAuthLogger,
  clearAuthLogs,
  setAuthLogPrisma,
  getPersistedAuthLogs,
  type AuthLogEntry,
  type AuthEventType,
} from './auth-logging';
export {
  resolveEnvironmentContext,
  validateEnvironmentOwnership,
  type EnvironmentContext,
} from './environment-context';

// Phase 20 — Production State Lock
export {
  validateProductionLock,
  enforceProductionLock,
  initializeProductionStores,
  isProductionStoresInitialized,
  getProductionHealthCheck,
  resetProductionLock,
  ProductionLockError,
  type ProductionLockStatus,
  type ProductionLockCheck,
} from './production-state-lock';

// Phase 20 — MCP Observability
export {
  startMcpSession,
  updateMcpSession,
  endMcpSession,
  getMcpObservabilityDashboard,
  getOrgMcpSessions,
  resetMcpObservability,
  type McpSessionSummary,
  type McpObservabilityDashboard,
} from './mcp-observability';

// Phase 20 — Plan Config Admin
export {
  getPlanConfig,
  getAllPlanConfigs,
  updatePlanConfig,
  computeConfigBasedEconomics,
  getAllConfigBasedEconomics,
  getConfigChangeLog,
  recordConfigChange,
  resetPlanConfigs,
  type PlanConfig,
  type ConfigBasedEconomics,
  type ConfigChangeEntry,
} from './plan-config-admin';

// Phase 20 — MCP Persistence
export {
  setMcpPersistenceStore,
  getMcpPersistenceStore,
  resetMcpPersistenceStore,
  InMemoryMcpPersistenceStore,
  PrismaMcpPersistenceStore,
  type McpPersistenceStore,
  type McpPromptEvent,
  type McpSessionRecord,
  type McpSuggestionClick,
  type PlaybookRunRecord,
  type AnalysisJobRecord,
} from './mcp-persistence';
