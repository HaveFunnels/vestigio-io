import { prisma } from "@/libs/prismaDb";
import { NextResponse } from "next/server";

// Public endpoint — no auth required.
// Returns branding_config (logos, favicon, og_image) with cache headers.

export async function GET() {
  try {
    const row = await prisma.platformConfig.findUnique({
      where: { configKey: "branding_config" },
    });

    let branding: Record<string, unknown> = {
      logo_light: null,
      logo_dark: null,
      favicon: null,
      og_image: null,
    };

    if (row) {
      try {
        branding = { ...branding, ...JSON.parse(row.value) };
      } catch {
        // keep defaults
      }
    }

    return NextResponse.json(
      { branding },
      {
        headers: {
          "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
        },
      },
    );
  } catch (err: any) {
    console.error("[branding GET]", err);
    return NextResponse.json(
      { branding: { logo_light: null, logo_dark: null, favicon: null, og_image: null } },
      { status: 200 },
    );
  }
}
