import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/libs/auth";
import {
	isMetaWhatsAppConfigured,
	registerAllLocalTemplates,
} from "@/libs/whatsapp-meta";

// ──────────────────────────────────────────────
// POST /api/admin/whatsapp/register-templates
//
// Admin-only. Submits every template from src/libs/whatsapp-templates.ts
// to Meta for approval. Templates that already exist are skipped (not
// errors). New/updated templates enter PENDING status and take 1-24h to
// be reviewed by Meta before they can be sent.
//
// Re-run this endpoint whenever you edit whatsapp-templates.ts.
// ──────────────────────────────────────────────

export async function POST() {
	const session = await getServerSession(authOptions);
	if (!session?.user || (session.user as any).role !== "ADMIN") {
		return NextResponse.json({ message: "Forbidden" }, { status: 403 });
	}

	if (!isMetaWhatsAppConfigured()) {
		return NextResponse.json(
			{ message: "Meta WhatsApp not configured. Set META_SYSTEM_USER_TOKEN + META_WABA_ID first." },
			{ status: 400 },
		);
	}

	const results = await registerAllLocalTemplates();

	const summary = {
		total: results.length,
		created: results.filter((r) => r.status === "created").length,
		already_exists: results.filter((r) => r.status === "already_exists").length,
		failed: results.filter((r) => r.status === "failed").length,
	};

	return NextResponse.json({ summary, results });
}
