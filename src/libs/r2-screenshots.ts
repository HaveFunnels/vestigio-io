// ──────────────────────────────────────────────
// R2 storage for surface screenshots (PV.9b)
//
// Worker-side R2 access (plain module — NO "use server", so the ingestion
// workers can import it the same way they import prismaDb). Reuses the exact
// Cloudflare R2 config already proven in src/actions/upload.ts (profile images).
//
// Degrade-safe: r2Configured() lets every caller no-op cleanly when the R2 env
// vars are absent (local dev, CI) instead of throwing — a missing screenshot is
// a soft gap in the Plano, never a failed cycle.
// ──────────────────────────────────────────────

import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectsCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

let _client: S3Client | null = null;

function client(): S3Client {
	if (_client) return _client;
	_client = new S3Client({
		region: "auto",
		endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
		credentials: {
			accessKeyId: process.env.R2_ACCESS_KEY_ID!,
			secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
		},
	});
	return _client;
}

/** True only when every R2 env var is present. Callers no-op when false. */
export function r2Configured(): boolean {
	return !!(
		process.env.R2_ACCOUNT_ID &&
		process.env.R2_ACCESS_KEY_ID &&
		process.env.R2_SECRET_ACCESS_KEY &&
		process.env.R2_BUCKET_NAME
	);
}

/** Stable key for a surface screenshot. Hash keeps the URL out of the key
 *  (URLs contain chars R2 dislikes) while staying deterministic per cycle+url. */
export function screenshotKey(environmentId: string, cycleRef: string, urlHash: string): string {
	return `surface-screenshots/${environmentId}/${cycleRef}/${urlHash}.jpg`;
}

/** Upload a JPEG screenshot buffer to R2. Throws on failure (caller catches). */
export async function uploadScreenshot(key: string, body: Buffer): Promise<void> {
	await client().send(
		new PutObjectCommand({
			Bucket: process.env.R2_BUCKET_NAME!,
			Key: key,
			Body: body,
			ContentType: "image/jpeg",
		}),
	);
}

/** Stable key for a free-audit mini-scan screenshot (single homepage
 *  capture keyed by leadId + url hash). Sibling namespace to
 *  surface-screenshots so the TTL purge cron can prefix-scan the
 *  free-scan set independently when we need to (e.g. batch cleanup by
 *  expiredLeads). */
export function miniScreenshotKey(leadId: string, urlHash: string): string {
	return `mini-audit-screenshots/${leadId}/${urlHash}.jpg`;
}

/** Batch-delete a set of R2 keys. Silent on individual failures — we're
 *  called from the TTL purge cron and a stuck delete shouldn't block the
 *  Prisma deleteMany that runs after. S3 DeleteObjects supports up to
 *  1000 keys per call; the free-lead purge batches are much smaller. */
export async function deleteScreenshots(keys: string[]): Promise<void> {
	if (keys.length === 0) return;
	try {
		await client().send(
			new DeleteObjectsCommand({
				Bucket: process.env.R2_BUCKET_NAME!,
				Delete: {
					Objects: keys.map((Key) => ({ Key })),
					Quiet: true,
				},
			}),
		);
	} catch (err) {
		console.warn(`[r2-screenshots] batch delete failed (${keys.length} keys):`, err);
	}
}

/** Presigned GET URL for rendering the screenshot in the Plano. Default 1h —
 *  long enough for a plan page session, short enough to keep the asset private. */
export async function getScreenshotUrl(key: string, expiresIn = 3600): Promise<string> {
	return getSignedUrl(
		client(),
		new GetObjectCommand({
			Bucket: process.env.R2_BUCKET_NAME!,
			Key: key,
		}),
		{ expiresIn },
	);
}
