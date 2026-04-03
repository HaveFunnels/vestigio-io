import { authOptions } from "@/libs/auth";
import { withErrorTracking } from "@/libs/error-tracker";
import { prisma } from "@/libs/prismaDb";
import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/admin/marketing/pixels — list all tracking pixels
 * POST /api/admin/marketing/pixels — create or update a pixel
 * DELETE /api/admin/marketing/pixels — delete a pixel by id
 */

export const GET = withErrorTracking(
  async function GET() {
    const session = await getServerSession(authOptions);
    if (!session?.user || (session.user as any).role !== "ADMIN") {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    try {
      const pixels = await prisma.trackingPixel.findMany({
        orderBy: { createdAt: "desc" },
      });
      return NextResponse.json({ pixels });
    } catch (err) {
      console.error("[pixels GET]", err);
      return NextResponse.json(
        { message: "Failed to fetch pixels" },
        { status: 500 },
      );
    }
  },
  { endpoint: "/api/admin/marketing/pixels", method: "GET" },
);

export const POST = withErrorTracking(
  async function POST(req: NextRequest) {
    const session = await getServerSession(authOptions);
    if (!session?.user || (session.user as any).role !== "ADMIN") {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    try {
      const body = await req.json();
      const { id, name, type, pixelId, enabled, config } = body;

      if (!name || !type || !pixelId) {
        return NextResponse.json(
          { message: "name, type, and pixelId are required" },
          { status: 400 },
        );
      }

      if (id) {
        const updated = await prisma.trackingPixel.update({
          where: { id },
          data: {
            name,
            type,
            pixelId,
            enabled: enabled ?? true,
            config: config ? (typeof config === "string" ? config : JSON.stringify(config)) : null,
          },
        });
        return NextResponse.json({ pixel: updated });
      }

      const created = await prisma.trackingPixel.create({
        data: {
          name,
          type,
          pixelId,
          enabled: enabled ?? true,
          config: config ? (typeof config === "string" ? config : JSON.stringify(config)) : null,
        },
      });
      return NextResponse.json({ pixel: created }, { status: 201 });
    } catch (err) {
      console.error("[pixels POST]", err);
      return NextResponse.json(
        { message: "Failed to save pixel" },
        { status: 500 },
      );
    }
  },
  { endpoint: "/api/admin/marketing/pixels", method: "POST" },
);

export const DELETE = withErrorTracking(
  async function DELETE(req: NextRequest) {
    const session = await getServerSession(authOptions);
    if (!session?.user || (session.user as any).role !== "ADMIN") {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    try {
      const { searchParams } = new URL(req.url);
      const id = searchParams.get("id");

      if (!id) {
        return NextResponse.json(
          { message: "id is required" },
          { status: 400 },
        );
      }

      await prisma.trackingPixel.delete({ where: { id } });
      return NextResponse.json({ ok: true });
    } catch (err) {
      console.error("[pixels DELETE]", err);
      return NextResponse.json(
        { message: "Failed to delete pixel" },
        { status: 500 },
      );
    }
  },
  { endpoint: "/api/admin/marketing/pixels", method: "DELETE" },
);
