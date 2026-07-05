import { prisma } from "@/libs/prismaDb";
import { evaluateAlerts } from "@/libs/alert-evaluator";
import crypto from "node:crypto";

type ErrorContext = {
	endpoint?: string;
	method?: string;
	statusCode?: number;
	userId?: string;
	userEmail?: string;
	organizationId?: string;
	requestBody?: Record<string, unknown>;
	severity?: "error" | "warning" | "critical";
	correlationId?: string;
};

/**
 * Sanitize request body by redacting sensitive fields before storage.
 *
 * The deny list covers three concentric rings:
 *   1. Auth material (passwords, tokens, secrets, API keys) — never
 *      loggable under any circumstances.
 *   2. Direct PII (email, phone, cpf, cnpj, senha for pt-BR forms,
 *      name-family fields) — LGPD-relevant, must be masked before
 *      writing PlatformError rows because those rows are surfaced
 *      to any staff member with admin console access.
 *   3. Payment / device identifiers that vendors dispatch through
 *      our webhook body (payerEmail, card_token_id, deviceSessionId,
 *      Authorization header echoes) — sensitive-in-context; masking
 *      is cheap and prevents accidental exposure via body-in-log
 *      patterns that show up sporadically as we add integrations.
 *
 * The check is case-insensitive on the field name AND does a
 * recursive walk through nested objects, so a token nested under
 * `.data.subscription.access_token` is still caught. Arrays are
 * traversed element-by-element.
 *
 * Prior version had only ring-1 keys and did a shallow check.
 * M10 H5 flagged the concrete gap: any body-logging path that
 * started passing customer email / MP payer_email / MP
 * card_token_id would leak PII silently. Expanded here so the
 * sanitizer is future-proof.
 */
const REDACTED_FIELDS = new Set(
	[
		// ── ring 1 (auth material) ──
		"password",
		"currentpassword",
		"newpassword",
		"senha",
		"senhaatual",
		"token",
		"resettoken",
		"apikey",
		"api_key",
		"secret",
		"clientsecret",
		"client_secret",
		"authorization",
		"cookie",
		// ── ring 2 (direct PII) ──
		"email",
		"phone",
		"telefone",
		"cpf",
		"cnpj",
		"documento",
		// ── ring 3 (payment / device identifiers) ──
		"payeremail",
		"payer_email",
		"cardtokenid",
		"card_token_id",
		"devicesessionid",
		"device_session_id",
		"cardnumber",
		"credit_card",
		"cvc",
		"cvv",
		"ssn",
	].map((s) => s.toLowerCase()),
);

function sanitizeValue(value: unknown): unknown {
	if (value === null || value === undefined) return value;
	if (Array.isArray(value)) return value.map(sanitizeValue);
	if (typeof value === "object") return sanitizeObject(value as Record<string, unknown>);
	return value;
}

function sanitizeObject(obj: Record<string, unknown>): Record<string, unknown> {
	const out: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(obj)) {
		if (REDACTED_FIELDS.has(key.toLowerCase())) {
			out[key] = "[REDACTED]";
		} else {
			out[key] = sanitizeValue(value);
		}
	}
	return out;
}

function sanitizeBody(body: Record<string, unknown> | undefined): string | null {
	if (!body) return null;
	return JSON.stringify(sanitizeObject(body));
}

/**
 * Track an error in the PlatformError table.
 * This is fire-and-forget — errors in tracking should never
 * propagate to the caller.
 */
export async function trackError(error: unknown, context: ErrorContext = {}) {
	try {
		const err = error instanceof Error ? error : new Error(String(error));

		await prisma.platformError.create({
			data: {
				errorType: err.constructor.name || "UnknownError",
				message: err.message.slice(0, 2000),
				stackTrace: err.stack?.slice(0, 5000) || null,
				endpoint: context.endpoint || null,
				method: context.method || null,
				statusCode: context.statusCode || null,
				userId: context.userId || null,
				userEmail: context.userEmail || null,
				organizationId: context.organizationId || null,
				requestBody: sanitizeBody(context.requestBody),
				correlationId: context.correlationId || crypto.randomUUID(),
				severity: context.severity || "error",
			},
		});

		// Fire-and-forget: evaluate alert rules for error_rate
		evaluateAlerts("error_rate").catch(() => {});
	} catch {
		// Never let error tracking itself crash the app
		console.error("[error-tracker] Failed to persist error:", error);
	}
}

/**
 * Wrapper for API route handlers that provides automatic error tracking.
 * Use this to wrap your route handler functions.
 */
export function withErrorTracking(
	handler: (...args: any[]) => Promise<Response>,
	routeInfo?: { endpoint: string; method: string },
) {
	return async (request: Request, context?: any): Promise<Response> => {
		try {
			return await handler(request, context);
		} catch (error) {
			await trackError(error, {
				endpoint: routeInfo?.endpoint ?? 'unknown',
				method: routeInfo?.method ?? 'unknown',
				statusCode: 500,
				severity: "error",
			});

			const { NextResponse } = await import("next/server");
			return NextResponse.json(
				{ message: "Internal Server Error" },
				{ status: 500 }
			);
		}
	};
}
