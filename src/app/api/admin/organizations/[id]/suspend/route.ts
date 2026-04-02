import { authOptions } from "@/libs/auth";
import { withErrorTracking } from "@/libs/error-tracker";
import { prisma } from "@/libs/prismaDb";
import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/admin/organizations/[id]/suspend — toggle org suspension
 * Body: { suspended: boolean }
 */
export const POST = withErrorTracking(async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getServerSession(authOptions);

  if (!session?.user || (session.user as any).role !== "ADMIN") {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const { id } = params;
  const body = await req.json().catch(() => ({}));
  const suspended = body.suspended !== false; // default to true

  try {
    const org = await prisma.organization.findUnique({ where: { id } });

    if (!org) {
      return NextResponse.json({ message: "Organization not found" }, { status: 404 });
    }

    const updated = await prisma.organization.update({
      where: { id },
      data: { status: suspended ? "suspended" : "active" },
      select: { id: true, name: true, status: true },
    });

    return NextResponse.json({
      message: `Organization ${suspended ? "suspended" : "reactivated"} successfully`,
      organization: updated,
    });
  } catch (err) {
    return NextResponse.json(
      { message: "Failed to update organization status" },
      { status: 500 },
    );
  }
}, { endpoint: "/api/admin/organizations/[id]/suspend", method: "POST" });
