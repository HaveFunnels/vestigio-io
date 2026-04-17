#!/usr/bin/env tsx
/**
 * TimescaleDB setup — idempotent, run after prisma db push.
 *
 * Converts RawBehavioralEvent into a time-partitioned hypertable so
 * high-volume event ingestion scales without manual sharding. This
 * is transparent to Prisma — all SQL operations (createMany, findMany,
 * deleteMany) work exactly the same, but Postgres distributes rows
 * across weekly chunks internally.
 *
 * Run:  npx tsx scripts/setup-timescaledb.ts
 *   or: npm run db:setup  (which does prisma db push + this script)
 *
 * Safe to run on every deploy:
 *   - CREATE EXTENSION IF NOT EXISTS → no-op if already enabled
 *   - create_hypertable with if_not_exists → no-op if already converted
 *   - Gracefully skips when TimescaleDB is not available (local dev
 *     without the extension), so devs don't need to install it locally.
 *
 * Prerequisites:
 *   - Railway Postgres (or any Postgres with TimescaleDB available)
 *   - DATABASE_URL env var pointing to the database
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
	console.log("[timescaledb] checking TimescaleDB availability...");

	try {
		// Enable TimescaleDB extension. No-op if already enabled.
		await prisma.$executeRawUnsafe(
			`CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;`,
		);
		console.log("[timescaledb] extension enabled");
	} catch (err: any) {
		if (
			err?.message?.includes("not available") ||
			err?.message?.includes("could not open") ||
			err?.message?.includes("not found")
		) {
			console.log(
				"[timescaledb] extension not available on this Postgres instance — skipping (OK for local dev)",
			);
			return;
		}
		throw err;
	}

	try {
		// Convert RawBehavioralEvent to a hypertable partitioned by
		// receivedAt in 7-day chunks. The if_not_exists flag makes this
		// idempotent — safe to run on every deploy.
		//
		// Prisma's cuid() primary key (column "id") works fine with
		// TimescaleDB 2.0+ which no longer requires the time column to
		// be part of the PK. Uniqueness is enforced per-chunk, which is
		// correct for globally-unique cuid() values.
		await prisma.$executeRawUnsafe(`
			SELECT create_hypertable(
				'"RawBehavioralEvent"',
				'receivedAt',
				chunk_time_interval => INTERVAL '7 days',
				if_not_exists => TRUE,
				migrate_data => TRUE
			);
		`);
		console.log(
			"[timescaledb] RawBehavioralEvent is now a hypertable (7-day chunks by receivedAt)",
		);
	} catch (err: any) {
		// "already a hypertable" is not an error — if_not_exists handles it,
		// but some versions surface a notice as an error. Swallow it.
		if (err?.message?.includes("already a hypertable")) {
			console.log("[timescaledb] RawBehavioralEvent was already a hypertable — no-op");
		} else {
			throw err;
		}
	}

	// Enable compression for chunks older than 7 days. Compressed chunks
	// use ~90% less disk and are still queryable (transparent decompression).
	try {
		await prisma.$executeRawUnsafe(`
			ALTER TABLE "RawBehavioralEvent"
			SET (
				timescaledb.compress,
				timescaledb.compress_segmentby = 'envId',
				timescaledb.compress_orderby = 'occurredAt DESC'
			);
		`);
		// Policy: auto-compress chunks older than 7 days
		await prisma.$executeRawUnsafe(`
			SELECT add_compression_policy(
				'"RawBehavioralEvent"',
				INTERVAL '7 days',
				if_not_exists => TRUE
			);
		`);
		console.log("[timescaledb] compression enabled (segmentby=envId, 7-day policy)");
	} catch (err: any) {
		// Compression already configured — safe to swallow
		if (
			err?.message?.includes("already enabled") ||
			err?.message?.includes("already exists")
		) {
			console.log("[timescaledb] compression was already configured — no-op");
		} else {
			console.warn("[timescaledb] compression setup skipped:", err?.message);
		}
	}

	console.log("[timescaledb] setup complete ✓");
}

main()
	.catch((err) => {
		console.error("[timescaledb] setup failed:", err);
		process.exit(1);
	})
	.finally(() => prisma.$disconnect());
