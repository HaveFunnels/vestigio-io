import { isProduction } from './env-validation';
import { setUsageStore, InMemoryUsageStore, PrismaUsageStore, getActiveStore } from '../mcp/usage';
import { setAuditStore, InMemoryAuditStore } from '../mcp/audit-lifecycle';
import { setSaasAccessStore, InMemorySaasAccessStore, PrismaSaasAccessStore } from './saas-access-store';
import { setAuthLogPrisma } from './auth-logging';
import { setMcpPersistenceStore, InMemoryMcpPersistenceStore, PrismaMcpPersistenceStore } from './mcp-persistence';
import { setTokenLedgerStore, InMemoryTokenLedgerStore, PrismaTokenLedgerStore } from './token-ledger';
import { setConversationStore, InMemoryConversationStore, PrismaConversationStore } from './conversation-store';

// ──────────────────────────────────────────────
// Production Store Enforcement
//
// In production: ALWAYS use Prisma-backed stores.
// In development/test: in-memory is acceptable.
//
// Rules:
// - production + InMemoryStore → THROW
// - no runtime store switching after init
// - enforced once at startup
// ──────────────────────────────────────────────

let storesInitialized = false;

export class StoreEnforcementError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StoreEnforcementError';
  }
}

/**
 * Initialize stores based on environment.
 * In production, requires a Prisma instance.
 * In dev/test, uses in-memory stores.
 */
export function initializeStores(prisma?: any): void {
  if (storesInitialized) {
    throw new StoreEnforcementError('Stores already initialized. Cannot re-initialize.');
  }

  if (isProduction()) {
    if (!prisma) {
      throw new StoreEnforcementError(
        'Production mode requires a Prisma client for persistent stores. ' +
        'Pass prisma instance to initializeStores().'
      );
    }
    setUsageStore(new PrismaUsageStore(prisma));
    setSaasAccessStore(new PrismaSaasAccessStore(prisma));
    setAuthLogPrisma(prisma);
    setMcpPersistenceStore(new PrismaMcpPersistenceStore(prisma));
    setTokenLedgerStore(new PrismaTokenLedgerStore(prisma));
    setConversationStore(new PrismaConversationStore(prisma));
    console.log('✓ Production stores initialized (Prisma-backed)');
  } else {
    setUsageStore(new InMemoryUsageStore());
    setAuditStore(new InMemoryAuditStore());
    setSaasAccessStore(new InMemorySaasAccessStore());
    setMcpPersistenceStore(new InMemoryMcpPersistenceStore());
    setTokenLedgerStore(new InMemoryTokenLedgerStore());
    setConversationStore(new InMemoryConversationStore());
    console.log('✓ Development stores initialized (in-memory)');
  }

  storesInitialized = true;
}

/**
 * Verify that stores are initialized.
 * Call before any MCP operation.
 */
export function assertStoresReady(): void {
  if (!storesInitialized) {
    throw new StoreEnforcementError(
      'Stores not initialized. Call initializeStores() before any MCP operation.'
    );
  }
}

/**
 * Verify production is not using in-memory stores.
 * Called during health checks.
 */
export function validateStoreConfiguration(): {
  valid: boolean;
  message: string;
} {
  if (!storesInitialized) {
    return { valid: false, message: 'Stores not initialized' };
  }

  if (isProduction()) {
    const store = getActiveStore();
    if (store instanceof InMemoryUsageStore) {
      return { valid: false, message: 'Production is using InMemoryUsageStore — data will not persist' };
    }
  }

  return { valid: true, message: 'Store configuration OK' };
}

// For testing: reset initialization flag
export function resetStoreEnforcement(): void {
  storesInitialized = false;
}
