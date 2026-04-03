import { prisma } from "@/libs/prismaDb";
import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/analytics/event — Public, no auth.
 * Records a marketing event (click, scroll, CTA, etc.)
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const { sessionId, eventType, path, target, metadata } = body;

    if (!sessionId || !eventType || !path) {
      return NextResponse.json(
        { message: "sessionId, eventType, and path are required" },
        { status: 400 },
      );
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
