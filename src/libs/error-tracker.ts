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
 */
function sanitizeBody(body: Record<string, unknown> | undefined): string | null {
	if (!body) return null;
	const sensitive = [
		"password",
		"currentPassword",
		"newPassword",
		"token",
		"resetToken",
		"apiKey",
		"secret",
		"credit_card",
		"ssn",
	];
	const sanitized = { ...body };
	for (const key of sensitive) {
		if (key in sanitized) {
			sanitized[key] = "[REDACTED]";
		}
	}
	return JSON.stringify(sanitized);
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
