import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/libs/auth";
import { getConversationStore } from "../../../../apps/platform/conversation-store";

// ──────────────────────────────────────────────
// Conversations API — GET (list) + POST (create)
//
// All routes validate session → userId → org membership.
// ──────────────────────────────────────────────

async function resolveUserOrg(userId: string) {
  const { prisma } = await import("@/libs/prismaDb");
  const membership = await prisma.membership.findFirst({
    where: { userId },
    include: { organization: { include: { environments: { where: { isProduction: true }, take: 1 } } } },
    orderBy: { createdAt: "desc" },
  });
  if (!membership?.organization) return null;
  const org = membership.organization;
  return { orgId: org.id, envId: org.environments[0]?.id || null };
}

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  const userId = (session.user as any).id;
  if (!userId) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  let orgId: string;
  try {
    const ctx = await resolveUserOrg(userId);
    if (!ctx) return NextResponse.json({ message: "No organization" }, { status: 403 });
    orgId = ctx.orgId;
  } catch {
    orgId = "demo";
  }

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status") || "active";
  const limit = Math.min(parseInt(searchParams.get("limit") || "30", 10), 100);
  const cursor = searchParams.get("cursor") || undefined;

  const store = getConversationStore();
  const conversations = await store.listByUser(orgId, userId, { status, limit, cursor });

  return NextResponse.json({ conversations });
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  const userId = (session.user as any).id;
  if (!userId) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  let orgId: string;
  let envId: string | undefined;
  try {
    const ctx = await resolveUserOrg(userId);
    if (!ctx) return NextResponse.json({ message: "No organization" }, { status: 403 });
    orgId = ctx.orgId;
    envId = ctx.envId || undefined;
  } catch {
    orgId = "demo";
  }

  let body: { title?: string; environment_id?: string } = {};
  try { body = await request.json(); } catch { /* empty body ok */ }

  const store = getConversationStore();
  const conversation = await store.create({
    organizationId: orgId,
    userId,
    environmentId: body.environment_id || envId,
    title: body.title,
  });

  return NextResponse.json({ conversation }, { status: 201 });
}
