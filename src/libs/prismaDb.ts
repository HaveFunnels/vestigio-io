import { PrismaClient } from "@prisma/client";

const globalForPrisma = global as unknown as { prisma: PrismaClient };

/**
 * Resolve the DATABASE_URL with a role-appropriate `connection_limit`.
 *
 * The web tier and the audit-runner share the same Postgres database
 * but compete for connections from the same pool. Without an explicit
 * limit, Prisma defaults to `num_cpus * 2 + 1` per process, which on a
 * shared-CPU host gives ~5 connections. A worker that fans out parallel
 * evidence writes will drain that in milliseconds and the web tier
 * stalls waiting for the pool.
 *
 * Strategy:
 *   - WORKER_ROLE=1 in the worker service → larger pool (default 20)
 *   - Otherwise (web)                       → smaller pool (default 8)
 *   - Both knobs are env-tunable (DB_POOL_SIZE_WORKER / DB_POOL_SIZE_WEB)
 *   - If the DATABASE_URL already carries `connection_limit=`, we respect
 *     the operator's explicit choice and don't touch it.
 *
 * In Railway / Render, this means the worker service sets WORKER_ROLE=1
 * via its start command (see package.json `start:worker`), while the web
 * service leaves it unset and inherits the smaller pool. Same
 * DATABASE_URL, different effective pool sizes.
 */
function resolveDatabaseUrl(): string | undefined {
	const baseUrl = process.env.DATABASE_URL;
	if (!baseUrl) return undefined;
	if (baseUrl.includes("connection_limit=")) return baseUrl;

	const isWorker = process.env.WORKER_ROLE === "1";
	const defaultLimit = isWorker ? 20 : 8;
	const envOverride = isWorker
		? process.env.DB_POOL_SIZE_WORKER
		: process.env.DB_POOL_SIZE_WEB;
	const limit = envOverride ? Number(envOverride) : defaultLimit;
	if (!Number.isFinite(limit) || limit <= 0) return baseUrl;

	const sep = baseUrl.includes("?") ? "&" : "?";
	return `${baseUrl}${sep}connection_limit=${limit}`;
}

export const prisma =
	globalForPrisma.prisma ||
	new PrismaClient({
		log: process.env.NODE_ENV === "development" ? ["query"] : [],
		datasources: { db: { url: resolveDatabaseUrl() } },
	});

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
