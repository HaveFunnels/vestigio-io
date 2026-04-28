import { prisma } from "@/libs/prismaDb";
import { checkRateLimit } from "@/libs/limiter";
import { hashClientIp } from "@/libs/behavioral-ingest";
import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/analytics/pageview — Public, rate-limited.
 * Records a marketing page view.
 * Captures visitor IP for geographic breakdown.
 * Limit: 30 requests per minute per IP.
 */
export async function POST(req: NextRequest) {
  // Rate limit: 30 page views per minute per IP
  const rateLimitResponse = await checkRateLimit(30, 60000);
  if (rateLimitResponse) return rateLimitResponse;

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

    // Validate sessionId format (prevent injection)
    if (typeof sessionId !== "string" || sessionId.length > 100) {
      return NextResponse.json({ ok: false }, { status: 400 });
    }

    // Extract visitor IP for geographic data
    const ip = extractIp(req);
    const country = body.country ? String(body.country).slice(0, 100) : null;
    const city = body.city ? String(body.city).slice(0, 100) : null;

    // Fire and forget — create pageview immediately, resolve geo in background
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
          country,
          city,
          ip: hashClientIp(ip),
          device: device ? String(device).slice(0, 20) : null,
          browser: browser ? String(browser).slice(0, 50) : null,
          os: os ? String(os).slice(0, 50) : null,
          abVariant: abVariant ? String(abVariant).slice(0, 100) : null,
        },
      })
      .then((pv) => {
        // Background: resolve geo from IP and patch the row
        if (!ip) return;
        resolveGeo(ip).then((geo) => {
          if (!geo) return;
          prisma.pageView.update({
            where: { id: pv.id },
            data: {
              country: pv.country || geo.country,
              city: pv.city || geo.city,
              region: geo.region,
              lat: geo.lat,
              lng: geo.lng,
            },
          }).catch(() => {});
        }).catch(() => {});
      })
      .catch(() => {});

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
}

// ── IP extraction ──

function extractIp(req: NextRequest): string | null {
  // Railway / Vercel / Cloudflare forward the real IP via headers
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();

  const realIp = req.headers.get("x-real-ip");
  if (realIp) return realIp.trim();

  const cfIp = req.headers.get("cf-connecting-ip");
  if (cfIp) return cfIp.trim();

  return null;
}

// ── Lightweight geo resolution ──
// Uses free ip-api.com (no API key, 45 req/min for non-commercial)
// Falls back gracefully if unavailable

interface GeoResult {
  country: string | null;
  region: string | null;
  city: string | null;
  lat: number | null;
  lng: number | null;
}

const geoCache = new Map<string, GeoResult & { ts: number }>();
const GEO_CACHE_TTL = 3600_000; // 1 hour

async function resolveGeo(ip: string): Promise<GeoResult | null> {
  // Skip private/local IPs
  if (ip.startsWith("127.") || ip.startsWith("10.") || ip.startsWith("192.168.") || ip === "::1") {
    return null;
  }

  // Check cache
  const cached = geoCache.get(ip);
  if (cached && Date.now() - cached.ts < GEO_CACHE_TTL) {
    const { ts, ...result } = cached;
    return result;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);

    const res = await fetch(
      `http://ip-api.com/json/${ip}?fields=status,country,regionName,city,lat,lon`,
      { signal: controller.signal },
    );
    clearTimeout(timeout);

    if (!res.ok) return null;

    const data = await res.json();
    if (data.status !== "success") return null;

    const result: GeoResult = {
      country: data.country || null,
      region: data.regionName || null,
      city: data.city || null,
      lat: typeof data.lat === "number" ? data.lat : null,
      lng: typeof data.lon === "number" ? data.lon : null,
    };

    geoCache.set(ip, { ...result, ts: Date.now() });

    // Prune cache if too large
    if (geoCache.size > 10000) {
      const oldest = [...geoCache.entries()].sort((a, b) => a[1].ts - b[1].ts);
      for (let i = 0; i < 5000; i++) geoCache.delete(oldest[i][0]);
    }

    return result;
  } catch {
    return null;
  }
}
