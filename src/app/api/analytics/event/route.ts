import { prisma } from "@/libs/prismaDb";
import { checkRateLimit } from "@/libs/limiter";
import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/analytics/event — Public, rate-limited.
 * Records a marketing event (click, scroll, CTA, etc.)
 * Limit: 60 requests per minute per IP.
 */
export async function POST(req: NextRequest) {
  // Rate limit: 60 events per minute per IP
  const rateLimitResponse = await checkRateLimit(60, 60000);
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const body = await req.json();

    const { sessionId, eventType, path, target, metadata } = body;

    if (!sessionId || !eventType || !path) {
      return NextResponse.json(
        { message: "sessionId, eventType, and path are required" },
        { status: 400 },
      );
    }

    // Validate inputs
    if (typeof sessionId !== "string" || sessionId.length > 100) {
      return NextResponse.json({ ok: false }, { status: 400 });
    }

    // Allowlist of valid event types
    const validEventTypes = ["click", "scroll_depth", "cta_click", "form_start", "form_complete", "signup", "time_on_page", "drop_off"];
    if (!validEventTypes.includes(eventType)) {
      return NextResponse.json({ ok: false }, { status: 400 });
    }

    // Fire and forget
    prisma.marketingEvent
      .create({
        data: {
          sessionId: String(sessionId).slice(0, 100),
          eventType: String(eventType).slice(0, 50),
          path: String(path).slice(0, 500),
          target: target ? String(target).slice(0, 200) : null,
          metadata: metadata
            ? String(typeof metadata === "object" ? JSON.stringify(metadata) : metadata).slice(0, 5000)
            : null,
        },
      })
      .catch(() => {});

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
}
