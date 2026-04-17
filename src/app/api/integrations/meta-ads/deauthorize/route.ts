import { NextResponse } from "next/server";
import { prisma } from "@/libs/prismaDb";
import { decryptConfig } from "@/libs/integration-crypto";
import { parseSignedRequest, extractMetaUserId } from "@/libs/meta-signed-request";

// ──────────────────────────────────────────────
// Meta Deauthorize Callback
//
// POST /api/integrations/meta-ads/deauthorize
//
// Fires when a user revokes Vestigio's app permissions in Facebook.
// We disconnect any IntegrationConnection tied to that Meta user so
// the next audit cycle doesn't attempt to poll with a token the user
// has already invalidated.
//
// Same signed_request body + signature verification as the deletion
// webhook. Meta expects a 200 response — no body required.
// ──────────────────────────────────────────────

const META_APP_SECRET = process.env.META_ADS_APP_SECRET || process.env.META_APP_SECRET || "";

export async function GET() {
	return NextResponse.json({ status: "active", service: "vestigio-deauthorize" });
}

export async function POST(request: Request) {
	if (!META_APP_SECRET) {
		return NextResponse.json(
			{ error: "meta_app_not_configured" },
			{ status: 500 },
		);
	}

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
		return NextResponse.json({ error: "user_id_missing" }, { status: 400 });
	}

	const candidates = await prisma.integrationConnection.findMany({
		where: { provider: "meta_ads", status: "connected" },
	});

	let disconnected = 0;
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
				syncError: `Deauthorized in Meta at ${new Date().toISOString()}`,
			},
		});
		disconnected++;
	}

	console.log(
		`[meta-ads-deauthorize] Meta user ${metaUserId} — disconnected ${disconnected} integration(s)`,
	);

	return NextResponse.json({ status: "ok", disconnected });
}
