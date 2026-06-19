import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/libs/auth";
import { prisma } from "@/libs/prismaDb";

// ──────────────────────────────────────────────
// requireAdmin — Wave 18e
//
// Centralized admin gate for /api/admin/* routes. Replaces the
// pre-existing pattern of inlining
//
//   if (!session?.user || (session.user as any).role !== "ADMIN") {
//     return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
//   }
//
// in every admin route. Two problems with the inline version:
//
//   1. JWT role is a cached snapshot from sign-in time. If an admin
//      is demoted in the database, their JWT keeps `role: "ADMIN"`
//      for up to 30 days (the cookie ceiling). Every admin API was a
//      privilege-escalation persistence path: the ex-admin could still
//      call trigger-audit, impersonate, suspend orgs, etc. for weeks
//      after their access was supposedly revoked.
//
//   2. The check was duplicated in 30+ files. Any drift between
//      copies — say, one route forgetting the `!session?.user` half —
//      creates a silent gap.
//
// This helper does the same fast-path JWT check first (no DB hit for
// non-admins), then does a single point-read against User.role to
// confirm the cached claim is still true. Fail-closed: any DB error
// denies admin access.
//
// Usage:
//
//   export async function POST(request: Request) {
//     const gate = await requireAdmin();
//     if (gate.denied) return gate.denied;
//     // gate.admin.{ userId, email } is now available
//   }
// ──────────────────────────────────────────────

export interface AdminGateContext {
	userId: string;
	email: string | null;
}

export type AdminGateResult =
	| { denied: NextResponse; admin?: never }
	| { denied?: never; admin: AdminGateContext };

export async function requireAdmin(): Promise<AdminGateResult> {
	const session = await getServerSession(authOptions);
	if (!session?.user || (session.user as { role?: string }).role !== "ADMIN") {
		return { denied: NextResponse.json({ message: "Unauthorized" }, { status: 401 }) };
	}
	const userId = (session.user as { id?: string }).id;
	if (!userId) {
		return { denied: NextResponse.json({ message: "Invalid session" }, { status: 401 }) };
	}

	// DB re-check — catches the stale-JWT case where the user has been
	// demoted from ADMIN to USER in the database but the cookie hasn't
	// been refreshed yet.
	try {
		const user = await prisma.user.findUnique({
			where: { id: userId },
			select: { role: true, email: true },
		});
		if (!user || user.role !== "ADMIN") {
			console.warn(
				`[require-admin] user ${userId} has stale ADMIN in JWT but DB role=${user?.role ?? "missing"} — denied`,
			);
			return { denied: NextResponse.json({ message: "Unauthorized" }, { status: 401 }) };
		}
		return { admin: { userId, email: user.email } };
	} catch (err) {
		// Fail-closed: deny on DB outage instead of granting access
		// based on the cached JWT alone.
		return { denied: NextResponse.json({ message: "Service unavailable" }, { status: 503 }) };
	}
}
