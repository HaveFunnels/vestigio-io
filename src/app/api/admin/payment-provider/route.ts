import { logAuditEvent } from "@/libs/audit-log";
import { withErrorTracking } from "@/libs/error-tracker";
import { getIp } from "@/libs/get-ip";
import { PROVIDER_CONFIG_KEY, getDefaultProvider } from "@/libs/payment-provider";
import { prisma } from "@/libs/prismaDb";
import { requireAdmin } from "@/libs/require-admin";
import { NextResponse } from "next/server";
import { z } from "zod";

// ──────────────────────────────────────────────
// Admin Payment Provider Override API
//
// GET  → current provider (override if set, else default)
// POST → save override (admin can switch active provider without
//        flipping env vars; useful when adding a second gateway or
//        rolling back to Paddle if the MP flow is misbehaving).
//
// Default resolution (when no override row exists in PlatformConfig)
// stays in getDefaultProvider() — env-based, MP-first.
// ──────────────────────────────────────────────

const providerSchema = z.object({
	provider: z.enum(["mercadopago", "paddle"]),
});

export const GET = withErrorTracking(async function GET() {
	const gate = await requireAdmin();
	if (gate.denied) return gate.denied;

	const row = await prisma.platformConfig.findUnique({
		where: { configKey: PROVIDER_CONFIG_KEY },
	});

	return NextResponse.json({
		// Override = explicit admin choice; null when admin hasn't set one.
		override: row?.value === "mercadopago" || row?.value === "paddle"
			? row.value
			: null,
		// Default that would apply if no override — surfaced so the UI
		// can show "Default: Mercado Pago" alongside the radio.
		default: getDefaultProvider(),
	});
});

export const POST = withErrorTracking(async function POST(req: Request) {
	const gate = await requireAdmin();
	if (gate.denied) return gate.denied;

	const body = await req.json().catch(() => ({}));
	const parsed = providerSchema.safeParse(body);
	if (!parsed.success) {
		return NextResponse.json(
			{ message: "Invalid provider", errors: parsed.error.format() },
			{ status: 400 },
		);
	}

	await prisma.platformConfig.upsert({
		where: { configKey: PROVIDER_CONFIG_KEY },
		update: { value: parsed.data.provider },
		create: { configKey: PROVIDER_CONFIG_KEY, value: parsed.data.provider },
	});

	await logAuditEvent({
		actorId: gate.admin.userId,
		actorEmail: gate.admin.email ?? "",
		action: "admin.payment_provider.update",
		metadata: { provider: parsed.data.provider },
		ipAddress: (await getIp()) ?? undefined,
	});

	return NextResponse.json({ ok: true, provider: parsed.data.provider });
});
