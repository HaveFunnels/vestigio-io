import { authOptions } from "@/libs/auth";
import { withErrorTracking } from "@/libs/error-tracker";
import { prisma } from "@/libs/prismaDb";
import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/admin/errors — list platform errors with filtering
 * Query params: severity, resolved, endpoint, limit, offset
 */
export const GET = withErrorTracking(async function GET(req: NextRequest) {
	const session = await getServerSession(authOptions);

	if (!session?.user || (session.user as any).role !== "ADMIN") {
		return NextResponse.json({ message: "Forbidden" }, { status: 403 });
	}

	const searchParams = req.nextUrl.searchParams;
	const severity = searchParams.get("severity");
	const resolved = searchParams.get("resolved");
	const endpoint = searchParams.get("endpoint");
	const errorType = searchParams.get("errorType");
	const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 200);
	const offset = parseInt(searchParams.get("offset") || "0");

	const where: Record<string, unknown> = {};

	if (severity) where.severity = severity;
	if (resolved !== null && resolved !== undefined && resolved !== "") {
		where.resolved = resolved === "true";
	}
	if (endpoint) where.endpoint = { contains: endpoint };
	if (errorType) where.errorType = errorType;

	try {
		const [errors, total, grouped] = await Promise.all([
			prisma.platformError.findMany({
				where,
				orderBy: { createdAt: "desc" },
				take: limit,
				skip: offset,
			}),
			prisma.platformError.count({ where }),
			// Group by errorType for summary
			prisma.platformError.groupBy({
				by: ["errorType"],
				_count: { id: true },
				_max: { createdAt: true },
				where: { resolved: false },
				orderBy: { _count: { id: "desc" } },
				take: 20,
			}),
		]);

		return NextResponse.json({
			errors,
			total,
			limit,
			offset,
			groupedByType: grouped.map((g: any) => ({
				errorType: g.errorType,
				count: g._count.id,
				lastOccurrence: g._max.createdAt,
			})),
		});
	} catch (error) {
		return NextResponse.json(
			{ message: "Failed to fetch errors" },
			{ status: 500 }
		);
	}
}, { endpoint: "/api/admin/errors", method: "GET" });

/**
 * PATCH /api/admin/errors — mark errors as resolved
 * Body: { ids: string[] }
 */
export const PATCH = withErrorTracking(async function PATCH(req: Request) {
	const session = await getServerSession(authOptions);

	if (!session?.user || (session.user as any).role !== "ADMIN") {
		return NextResponse.json({ message: "Forbidden" }, { status: 403 });
	}

	try {
		const body = await req.json();
		const { ids } = body;

		if (!Array.isArray(ids) || ids.length === 0) {
			return NextResponse.json(
				{ message: "ids array is required" },
				{ status: 400 }
			);
		}

		await prisma.platformError.updateMany({
			where: { id: { in: ids } },
			data: { resolved: true },
		});

		return NextResponse.json({ message: "Errors resolved" });
	} catch (error) {
		return NextResponse.json(
			{ message: "Failed to resolve errors" },
			{ status: 500 }
		);
	}
}, { endpoint: "/api/admin/errors", method: "PATCH" });

/**
 * DELETE /api/admin/errors — purge old errors (retention cleanup)
 * Query param: olderThanDays (default 14)
 */
export const DELETE = withErrorTracking(async function DELETE(req: NextRequest) {
	const session = await getServerSession(authOptions);

	if (!session?.user || (session.user as any).role !== "ADMIN") {
		return NextResponse.json({ message: "Forbidden" }, { status: 403 });
	}

	const days = parseInt(req.nextUrl.searchParams.get("olderThanDays") || "14");
	const cutoff = new Date();
	cutoff.setDate(cutoff.getDate() - days);

	try {
		const result = await prisma.platformError.deleteMany({
			where: { createdAt: { lt: cutoff } },
		});

		return NextResponse.json({
			message: `Purged ${result.count} errors older than ${days} days`,
		});
	} catch (error) {
		return NextResponse.json(
			{ message: "Failed to purge errors" },
			{ status: 500 }
		);
	}
}, { endpoint: "/api/admin/errors", method: "DELETE" });
