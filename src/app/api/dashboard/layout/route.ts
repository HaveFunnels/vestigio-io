import { isAuthorized } from "@/libs/isAuthorized";
import { prisma } from "@/libs/prismaDb";
import { NextRequest, NextResponse } from "next/server";
import { withErrorTracking } from "@/libs/error-tracker";
import {
	DEFAULT_LAYOUT,
	type WidgetInstance,
} from "@/lib/dashboard/default-layout";
import "@/lib/dashboard/init"; // side-effect: registers widgets so getWidgetDef works
import { getWidgetDef } from "@/lib/dashboard/init";

// ──────────────────────────────────────────────
// /api/dashboard/layout
//
// GET  → returns the user's saved bento layout, or DEFAULT_LAYOUT
//        if none exists yet (first visit, demo, fallback).
// PUT  → validates + upserts the layout for (userId, organizationId).
//
// **Validation philosophy:** the client is allowed to be wrong about
// many things (positions, sizes), but we are strict about the two
// things that would corrupt the dashboard if accepted blindly:
//
//   1. `defId` must reference a widget that exists in the registry —
//      otherwise the grid will render an "unknown widget" placeholder
//      forever, and a typo persists across sessions.
//   2. `instanceId` must be unique across the array — duplicates
//      cause react-grid-layout to silently drop items by key.
//
// We also clamp `w` to the widget definition's `[minSize, maxSize]`
// so a malformed client can't lock a user into a layout where one
// widget is 100 columns wide and unrecoverable.
//
// On any validation failure we return 400 with a precise reason and
// the layout is NOT persisted — the existing saved layout (or the
// default) stays intact.
// ──────────────────────────────────────────────

const MAX_WIDGETS_PER_LAYOUT = 24;

// ──────────────────────────────────────────────
// GET — load layout
// ──────────────────────────────────────────────
export const GET = withErrorTracking(
	async function GET() {
		const user = await isAuthorized();
		if (!user) {
			return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
		}

		const membership = await prisma.membership.findFirst({
			where: { userId: user.id },
			select: { organizationId: true },
		});

		if (!membership) {
			return NextResponse.json({ layout: DEFAULT_LAYOUT });
		}

		const saved = await prisma.dashboardLayout.findUnique({
			where: {
				userId_organizationId: {
					userId: user.id,
					organizationId: membership.organizationId,
				},
			},
		});

		if (!saved) {
			return NextResponse.json({ layout: DEFAULT_LAYOUT });
		}

		try {
			const parsed = JSON.parse(saved.layout) as WidgetInstance[];
			// Filter out any defIds that no longer exist in the registry
			// (defensive — schemaVersion bumps should normally rewrite the
			// stored layout, but if we miss a migration this prevents the
			// grid from rendering placeholders).
			const cleaned = parsed.filter(
				(inst) => getWidgetDef(inst.defId) !== undefined
			);
			return NextResponse.json({
				layout: cleaned.length > 0 ? cleaned : DEFAULT_LAYOUT,
			});
		} catch {
			// Stored JSON is corrupt — fall back to default rather than
			// 500ing the dashboard. The next PUT will overwrite the bad row.
			console.warn(
				"[api/dashboard/layout] corrupt layout JSON for user",
				user.id
			);
			return NextResponse.json({ layout: DEFAULT_LAYOUT });
		}
	},
	{ endpoint: "/api/dashboard/layout", method: "GET" }
);

// ──────────────────────────────────────────────
// PUT — save layout
// ──────────────────────────────────────────────
export const PUT = withErrorTracking(
	async function PUT(req: NextRequest) {
		const user = await isAuthorized();
		if (!user) {
			return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
		}

		const membership = await prisma.membership.findFirst({
			where: { userId: user.id },
			select: { organizationId: true },
		});

		if (!membership) {
			return NextResponse.json(
				{ message: "No organization for user" },
				{ status: 403 }
			);
		}

		let body: unknown;
		try {
			body = await req.json();
		} catch {
			return NextResponse.json(
				{ message: "Invalid JSON body" },
				{ status: 400 }
			);
		}

		const layout = (body as { layout?: unknown })?.layout;
		const validated = validateLayout(layout);
		if ("error" in validated) {
			return NextResponse.json({ message: validated.error }, { status: 400 });
		}

		await prisma.dashboardLayout.upsert({
			where: {
				userId_organizationId: {
					userId: user.id,
					organizationId: membership.organizationId,
				},
			},
			create: {
				userId: user.id,
				organizationId: membership.organizationId,
				layout: JSON.stringify(validated.layout),
			},
			update: {
				layout: JSON.stringify(validated.layout),
			},
		});

		return NextResponse.json({ ok: true, layout: validated.layout });
	},
	{ endpoint: "/api/dashboard/layout", method: "PUT" }
);

// ──────────────────────────────────────────────
// Validation
// ──────────────────────────────────────────────
type ValidationResult = { layout: WidgetInstance[] } | { error: string };

function validateLayout(input: unknown): ValidationResult {
	if (!Array.isArray(input)) {
		return { error: "layout must be an array" };
	}
	if (input.length === 0) {
		return { error: "layout must contain at least one widget" };
	}
	if (input.length > MAX_WIDGETS_PER_LAYOUT) {
		return { error: `layout cannot exceed ${MAX_WIDGETS_PER_LAYOUT} widgets` };
	}

	const seenInstanceIds = new Set<string>();
	const cleaned: WidgetInstance[] = [];

	for (let i = 0; i < input.length; i++) {
		const raw = input[i] as Record<string, unknown>;
		if (!raw || typeof raw !== "object") {
			return { error: `widget[${i}] is not an object` };
		}

		const instanceId = raw.instanceId;
		const defId = raw.defId;
		if (typeof instanceId !== "string" || instanceId.length === 0) {
			return { error: `widget[${i}].instanceId must be a non-empty string` };
		}
		if (typeof defId !== "string" || defId.length === 0) {
			return { error: `widget[${i}].defId must be a non-empty string` };
		}
		if (seenInstanceIds.has(instanceId)) {
			return { error: `duplicate instanceId "${instanceId}"` };
		}
		seenInstanceIds.add(instanceId);

		const def = getWidgetDef(defId);
		if (!def) {
			return { error: `unknown widget defId "${defId}"` };
		}

		const x = numberOr(raw.x, 0);
		const y = numberOr(raw.y, 0);
		let w = numberOr(raw.w, def.defaultSize.w);
		let h = numberOr(raw.h, def.defaultSize.h);

		if (x < 0 || y < 0) {
			return { error: `widget[${i}] x/y must be non-negative` };
		}

		// Clamp to widget's declared size constraints. Out-of-range
		// values get fixed silently — the registry is authoritative.
		w = Math.max(def.minSize.w, Math.min(def.maxSize?.w ?? 12, w));
		h = Math.max(def.minSize.h, Math.min(def.maxSize?.h ?? 12, h));

		cleaned.push({ instanceId, defId, x, y, w, h });
	}

	return { layout: cleaned };
}

function numberOr(value: unknown, fallback: number): number {
	if (typeof value === "number" && Number.isFinite(value)) {
		return Math.floor(value);
	}
	return fallback;
}
