import { getServerSession } from "next-auth";
import { authOptions } from "@/libs/auth";
import { NextResponse } from "next/server";

// ─────────────────────────────────────��────────
// Impersonation Guard
//
// Prevents destructive actions (DELETE, PUT on critical resources)
// when the current session is an admin impersonating a user.
//
// Usage in API routes:
//   const blocked = await blockIfImpersonating();
//   if (blocked) return blocked;
//
// Also checks max session duration (1 hour) for impersonated sessions.
// ──────────────────────────────────────────────

const MAX_IMPERSONATION_MS = 60 * 60 * 1000; // 1 hour

export async function blockIfImpersonating(): Promise<NextResponse | null> {
	const session = await getServerSession(authOptions);
	if (!session?.user) return null;

	const user = session.user as any;
	if (!user.isImpersonating) return null;

	// Check session timeout
	if (user.impersonationStartedAt) {
		const elapsed = Date.now() - user.impersonationStartedAt;
		if (elapsed > MAX_IMPERSONATION_MS) {
			return NextResponse.json(
				{ message: "Impersonation session expired (1h max). Please re-authenticate." },
				{ status: 403 },
			);
		}
	}

	return NextResponse.json(
		{ message: "Destructive actions are not allowed while impersonating a user." },
		{ status: 403 },
	);
}

/**
 * Check if the current session is impersonating (non-blocking).
 * Returns true if impersonating, false otherwise.
 */
export async function isImpersonating(): Promise<boolean> {
	const session = await getServerSession(authOptions);
	return (session?.user as any)?.isImpersonating === true;
}
