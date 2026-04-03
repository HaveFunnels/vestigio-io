import { prisma } from "@/libs/prismaDb";
import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/analytics/pageview — Public, no auth.
 * Records a marketing page view.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const {
      sessionId,
      path,
      referrer,
      utmSource,
      utmMedium,
      utmCampaign,
      utmContent,
      country,
      device,
      browser,
      os,
      abVariant,
    } = body;

    if (!sessionId || !path) {
      return NextResponse.json(
        { message: "sessionId and path are required" },
        { status: 400 },
      );
    }

    // Fire and forget — don't block the response
    prisma.pageView
      .create({
        data: {
          sessionId: String(sessionId).slice(0, 100),
          path: String(path).slice(0, 500),
          referrer: referrer ? String(referrer).slice(0, 2000) : null,
          utmSource: utmSource ? String(utmSource).slice(0, 200) : null,
          utmMedium: utmMedium ? String(utmMedium).slice(0, 200) : null,
          utmCampaign: utmCampaign ? String(utmCampaign).slice(0, 200) : null,
          utmContent: utmContent ? String(utmContent).slice(0, 200) : null,
          country: country ? String(country).slice(0, 100) : null,
          device: device ? String(device).slice(0, 20) : null,
          browser: browser ? String(browser).slice(0, 50) : null,
          os: os ? String(os).slice(0, 50) : null,
          abVariant: abVariant ? String(abVariant).slice(0, 100) : null,
        },
      })
      .catch(() => {});

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
}
