import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/libs/auth";
import { prisma } from "@/libs/prismaDb";
import { withErrorTracking } from "@/libs/error-tracker";
import { z } from "zod";

// ──────────────────────────────────────────────
// Environment Management — POST (create) + DELETE
//
// Requires org membership for creation.
// Requires owner role for deletion.
// ──────────────────────────────────────────────

async function resolveUserMembership(userId: string) {
  return prisma.membership.findFirst({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });
}

const createSchema = z.object({
  domain: z.string().min(3),
  landingUrl: z.string().url().optional(),
  isProduction: z.boolean().optional(),
});

export const POST = withErrorTracking(async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const userId = (session.user as any).id;
  if (!userId) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const membership = await resolveUserMembership(userId);
  if (!membership) {
    return NextResponse.json({ message: "No organization found" }, { status: 404 });
  }

  const body = await request.json();
  const res = createSchema.safeParse(body);

  if (!res.success) {
    return NextResponse.json(
      { message: "Invalid payload", errors: res.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const { domain, landingUrl, isProduction } = res.data;

  // Normalize domain
  const normalizedDomain = domain.replace(/^https?:\/\//, "").replace(/\/+$/, "");
  const resolvedLandingUrl = landingUrl || (domain.startsWith("http") ? domain : `https://${domain}`);

  const environment = await prisma.environment.create({
    data: {
      organizationId: membership.organizationId,
      domain: normalizedDomain,
      landingUrl: resolvedLandingUrl,
      isProduction: isProduction ?? false,
    },
  });

  return NextResponse.json({ environment }, { status: 201 });
}, { endpoint: "/api/organization/environments", method: "POST" });

const deleteSchema = z.object({
  environmentId: z.string().min(1),
});

export const DELETE = withErrorTracking(async function DELETE(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const userId = (session.user as any).id;
  if (!userId) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const membership = await resolveUserMembership(userId);
  if (!membership) {
    return NextResponse.json({ message: "No organization found" }, { status: 404 });
  }

  // Only owner can delete environments
  if (membership.role !== "owner") {
    return NextResponse.json({ message: "Only the organization owner can delete environments" }, { status: 403 });
  }

  const body = await request.json();
  const res = deleteSchema.safeParse(body);

  if (!res.success) {
    return NextResponse.json(
      { message: "Invalid payload", errors: res.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  // Verify environment belongs to this org
  const env = await prisma.environment.findFirst({
    where: {
      id: res.data.environmentId,
      organizationId: membership.organizationId,
    },
  });

  if (!env) {
    return NextResponse.json({ message: "Environment not found" }, { status: 404 });
  }

  await prisma.environment.delete({
    where: { id: env.id },
  });

  return NextResponse.json({ message: "Environment deleted" });
}, { endpoint: "/api/organization/environments", method: "DELETE" });
