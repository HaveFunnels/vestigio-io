import { NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/libs/prismaDb";
import { decryptConfig } from "@/libs/integration-crypto";
import { parseSignedRequest, extractMetaUserId } from "@/libs/meta-signed-request";

// ──────────────────────────────────────────────
// Meta Data Deletion Callback
//
// POST /api/integrations/meta-ads/deletion
//
// Meta's App Review requires this endpoint so a user can trigger
// deletion of the data Vestigio stores about them. Meta POSTs:
//   Content-Type: application/x-www-form-urlencoded
//   signed_request=<b64url>.<b64url>
//
// We verify the signature with META_APP_SECRET, extract the Meta
// user_id, and delete every IntegrationConnection whose stored
// meta_user_id matches. We then return a JSON body with a status URL
// + confirmation_code per Meta's spec.
//
// The confirmation_code is deterministic (HMAC of user_id) so the
// status URL works even after we've deleted all per-user rows.
// ──────────────────────────────────────────────

const META_APP_SECRET = process.env.META_ADS_APP_SECRET || process.env.META_APP_SECRET || "";

function getBaseUrl(): string {
	return process.env.SITE_URL || process.env.NEXTAUTH_URL || "http://localhost:3000";
}

function makeConfirmationCode(userId: string): string {
	return crypto
		.createHmac("sha256", META_APP_SECRET || "fallback")
		.update(`deletion:${userId}`)
		.digest("hex")
		.slice(0, 24);
}

export async function GET() {
	return NextResponse.json({ status: "active", service: "vestigio-data-deletion" });
}

export async function POST(request: Request) {
	if (!META_APP_SECRET) {
		return NextResponse.json(
			{ error: "meta_app_not_configured" },
			{ status: 500 },
		);
	}

	// Meta sends the signed_request as form-urlencoded OR as JSON; handle both.
	let signedRequest: string | null = null;
	const contentType = request.headers.get("content-type") || "";
	try {
		if (contentType.includes("application/x-www-form-urlencoded")) {
			const form = await request.formData();
			signedRequest = form.get("signed_request")?.toString() || null;
		} else if (contentType.includes("application/json")) {
			const body = (await request.json().catch(() => ({}))) as any;
			signedRequest = body?.signed_request || null;
		} else {
			const text = await request.text();
			const params = new URLSearchParams(text);
			signedRequest = params.get("signed_request");
		}
	} catch {
		/* fall through */
	}

	const payload = parseSignedRequest(signedRequest, META_APP_SECRET);
	if (!payload) {
		return NextResponse.json(
			{ error: "signature_verification_failed" },
			{ status: 400 },
		);
	}

	const metaUserId = extractMetaUserId(payload);
	if (!metaUserId) {
		return NextResponse.json(
			{ error: "user_id_missing" },
			{ status: 400 },
		);
	}

	// Find every IntegrationConnection where the encrypted config's
	// meta_user_id matches the target. Can't filter in SQL because
	// the config is encrypted — iterate and decrypt in memory. The
	// cardinality is bounded by our tenant count; acceptable here.
	const candidates = await prisma.integrationConnection.findMany({
		where: { provider: "meta_ads" },
	});

	let disconnectedCount = 0;
	for (const conn of candidates) {
		let cfg: Record<string, string> = {};
		try {
			cfg = decryptConfig(conn.config);
		} catch {
			continue;
		}
		if (cfg.meta_user_id !== metaUserId) continue;
		await prisma.integrationConnection.update({
			where: { id: conn.id },
			data: {
				status: "disconnected",
				config: "",
				syncError: `Disconnected via Meta data deletion webhook at ${new Date().toISOString()}`,
			},
		});
		disconnectedCount++;
	}

	const confirmationCode = makeConfirmationCode(metaUserId);
	const statusUrl = `${getBaseUrl()}/api/integrations/meta-ads/deletion-status/${confirmationCode}`;

	console.log(
		`[meta-ads-deletion] Meta user ${metaUserId} — disconnected ${disconnectedCount} integration(s), code=${confirmationCode}`,
	);

	return NextResponse.json({
		url: statusUrl,
		confirmation_code: confirmationCode,
	});
}
