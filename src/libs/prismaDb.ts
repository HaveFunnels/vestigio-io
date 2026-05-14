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

	// PgBouncer transaction-pool mode: PgBouncer owns the real pool, so
	// each app instance only needs ONE Prisma-side connection (it gets
	// multiplexed by PgBouncer onto the shared real pool). Detected via
	// `?pgbouncer=true` in the URL (the standard Prisma flag). Without
	// this the app would compete with PgBouncer's pool and lose.
	const isPgBouncer = /[?&]pgbouncer=true(?:&|$)/.test(baseUrl);
	if (isPgBouncer) {
		const sep = baseUrl.includes("?") ? "&" : "?";
		return `${baseUrl}${sep}connection_limit=1`;
	}

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

function buildPrisma(): PrismaClient {
	const url = resolveDatabaseUrl();
	// Only pass `datasources` when we have a URL to substitute. Passing
	// `{ url: undefined }` explicitly fails Prisma's constructor
	// validation, which broke the Next.js build on Railway (page-data
	// collection instantiates PrismaClient before DATABASE_URL is in
	// scope). Without the explicit datasources block, Prisma falls back
	// to its default env resolution at first query time — same behaviour
	// as before this file gained role-aware pool sizing.
	const opts: ConstructorParameters<typeof PrismaClient>[0] = {
		log: process.env.NODE_ENV === "development" ? ["query"] : [],
	};
	if (url) {
		opts.datasources = { db: { url } };
	}
	return new PrismaClient(opts);
}

export const prisma = globalForPrisma.prisma || buildPrisma();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
