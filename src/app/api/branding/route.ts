import { prisma } from "@/libs/prismaDb";
import { NextResponse } from "next/server";

// Public endpoint — no auth required.
// Returns branding_config, theme_config, and feature_flags with cache headers.

const KEYS = ["branding_config", "theme_config", "feature_flags"] as const;

export async function GET() {
  try {
    const rows = await prisma.platformConfig.findMany({
      where: { configKey: { in: KEYS as unknown as string[] } },
    });

    const map = new Map(rows.map((r: any) => [r.configKey, r.value]));

    const parse = (key: string, defaults: Record<string, unknown>) => {
      const raw = map.get(key);
      if (!raw) return defaults;
      try { return { ...defaults, ...JSON.parse(raw) }; }
      catch { return defaults; }
    };

    const branding = parse("branding_config", {
      logo_light: null, logo_dark: null, favicon: null, og_image: null,
    });

    const theme = parse("theme_config", {});
    const flags = parse("feature_flags", {
      blog_enabled: true, newsletter_enabled: true,
      i18n_enabled: false, ai_chat_enabled: true,
    });

    return NextResponse.json(
      { branding, theme, flags },
      {
        headers: {
          "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
        },
      },
    );
  } catch (err: any) {
    console.error("[branding GET]", err);
    return NextResponse.json(
      { branding: { logo_light: null, logo_dark: null, favicon: null, og_image: null }, theme: {}, flags: {} },
      { status: 200 },
    );
  }
}
