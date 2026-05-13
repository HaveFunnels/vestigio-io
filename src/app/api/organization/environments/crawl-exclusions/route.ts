import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/libs/auth";
import { prisma } from "@/libs/prismaDb";
import { withErrorTracking } from "@/libs/error-tracker";
import { z } from "zod";

// Patterns are glob-like: `*` matches zero-or-more chars, `?` matches one.
// We cap length + count to keep storage bounded and avoid pathological
// regexes when the patterns are compiled at crawl time.
const MAX_PATTERNS = 50;
const MAX_PATTERN_LENGTH = 200;

const patchSchema = z.object({
  environmentId: z.string().min(1),
  patterns: z
    .array(z.string().max(MAX_PATTERN_LENGTH))
    .max(MAX_PATTERNS)
    .transform((arr) => arr.map((p) => p.trim()).filter((p) => p.length > 0)),
});

async function resolveUserMembership(userId: string) {
  return prisma.membership.findFirst({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });
}

export const GET = withErrorTracking(async function GET(request: Request) {
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

  const { searchParams } = new URL(request.url);
  const environmentId = searchParams.get("environmentId");
  if (!environmentId) {
    return NextResponse.json({ message: "environmentId required" }, { status: 400 });
  }

  const env = await prisma.environment.findFirst({
    where: { id: environmentId, organizationId: membership.organizationId },
    select: { id: true, crawlExcludePatterns: true },
  });

  if (!env) {
    return NextResponse.json({ message: "Environment not found" }, { status: 404 });
  }

  return NextResponse.json({
    environmentId: env.id,
    patterns: env.crawlExcludePatterns,
  });
}, { endpoint: "/api/organization/environments/crawl-exclusions", method: "GET" });

export const PATCH = withErrorTracking(async function PATCH(request: Request) {
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
  const res = patchSchema.safeParse(body);
  if (!res.success) {
    return NextResponse.json(
      { message: "Invalid payload", errors: res.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const { environmentId, patterns } = res.data;

  const env = await prisma.environment.findFirst({
    where: { id: environmentId, organizationId: membership.organizationId },
    select: { id: true },
  });

  if (!env) {
    return NextResponse.json({ message: "Environment not found" }, { status: 404 });
  }

  const updated = await prisma.environment.update({
    where: { id: env.id },
    data: { crawlExcludePatterns: patterns },
    select: { id: true, crawlExcludePatterns: true },
  });

  return NextResponse.json({
    environmentId: updated.id,
    patterns: updated.crawlExcludePatterns,
  });
}, { endpoint: "/api/organization/environments/crawl-exclusions", method: "PATCH" });
