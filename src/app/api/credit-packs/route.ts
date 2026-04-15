import { withErrorTracking } from "@/libs/error-tracker";
import { getCreditPacks } from "@/libs/credit-packs";
import { NextResponse } from "next/server";

// ──────────────────────────────────────────────
// Credit packs — Max-plan top-up catalog.
//
// No auth: the list is non-sensitive (same IDs ship in the public
// Paddle.Checkout.open call) and caching this response at the edge
// is fine. The webhook is the only surface that actually credits
// an org — this endpoint is pure read.
// ──────────────────────────────────────────────

export const GET = withErrorTracking(
	async function GET() {
		const packs = await getCreditPacks();
		return NextResponse.json({ packs });
	},
	{ endpoint: "/api/credit-packs", method: "GET" },
);
