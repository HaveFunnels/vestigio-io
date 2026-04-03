import { authOptions } from "@/libs/auth";
import { prisma } from "@/libs/prismaDb";
import { withErrorTracking } from "@/libs/error-tracker";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

/**
 * POST /api/admin/impersonate
 * Returns the owner email for an organization so the admin
 * can call signIn("impersonate") on the client.
 *
 * Body: { organizationId: string }
 * Returns: { email: string, name: string }
 */
export const POST = withErrorTracking(async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user || (session.user as any).role !== "ADMIN") {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { organizationId } = await request.json();
  if (!organizationId) {
    return NextResponse.json({ message: "organizationId required" }, { status: 400 });
  }

  // Find the org owner
  const membership = await prisma.membership.findFirst({
    where: {
      organizationId,
      role: "owner",
    },
    include: {
      user: {
        select: { email: true, name: true },
      },
    },
  });

  if (!membership?.user?.email) {
    return NextResponse.json({ message: "No owner found for this organization" }, { status: 404 });
  }

  return NextResponse.json({
    email: membership.user.email,
    name: membership.user.name,
  });
}, { endpoint: "/api/admin/impersonate", method: "POST" });
