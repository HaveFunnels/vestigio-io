import { authOptions } from "@/libs/auth";
import { withErrorTracking } from "@/libs/error-tracker";
import { prisma } from "@/libs/prismaDb";
import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/admin/marketing/homepage-variants — list all homepage variants
 * POST /api/admin/marketing/homepage-variants — create or update a variant
 */

export const GET = withErrorTracking(
  async function GET() {
    const session = await getServerSession(authOptions);
    if (!session?.user || (session.user as any).role !== "ADMIN") {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    try {
      const variants = await prisma.homepageVariant.findMany({
        orderBy: { createdAt: "desc" },
      });
      return NextResponse.json({ variants });
    } catch (err) {
      console.error("[homepage-variants GET]", err);
      return NextResponse.json(
        { message: "Failed to fetch homepage variants" },
        { status: 500 },
      );
    }
  },
  { endpoint: "/api/admin/marketing/homepage-variants", method: "GET" },
);

export const POST = withErrorTracking(
  async function POST(req: NextRequest) {
    const session = await getServerSession(authOptions);
    if (!session?.user || (session.user as any).role !== "ADMIN") {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    try {
      const body = await req.json();
      const {
        id,
        name,
        slug,
        description,
        heroTitle,
        heroSubtitle,
        ctaText,
        ctaUrl,
        isDefault,
        status,
      } = body;

      if (!name || !slug) {
        return NextResponse.json(
          { message: "name and slug are required" },
          { status: 400 },
        );
      }

      if (id) {
        const updated = await prisma.homepageVariant.update({
          where: { id },
          data: {
            name,
            slug,
            description: description || null,
            heroTitle: heroTitle || null,
            heroSubtitle: heroSubtitle || null,
            ctaText: ctaText || null,
            ctaUrl: ctaUrl || null,
            isDefault: isDefault ?? false,
            status: status || "draft",
          },
        });
        return NextResponse.json({ variant: updated });
      }

      const created = await prisma.homepageVariant.create({
        data: {
          name,
          slug,
          description: description || null,
          heroTitle: heroTitle || null,
          heroSubtitle: heroSubtitle || null,
          ctaText: ctaText || null,
          ctaUrl: ctaUrl || null,
          isDefault: isDefault ?? false,
          status: status || "draft",
        },
      });
      return NextResponse.json({ variant: created }, { status: 201 });
    } catch (err) {
      console.error("[homepage-variants POST]", err);
      return NextResponse.json(
        { message: "Failed to save homepage variant" },
        { status: 500 },
      );
    }
  },
  { endpoint: "/api/admin/marketing/homepage-variants", method: "POST" },
);
