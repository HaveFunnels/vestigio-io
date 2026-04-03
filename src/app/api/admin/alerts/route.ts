import { authOptions } from "@/libs/auth";
import { prisma } from "@/libs/prismaDb";
import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

/**
 * GET  /api/admin/alerts — list alert rules with recent events
 * POST /api/admin/alerts — create or update an alert rule
 */

const ruleSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  description: z.string().optional(),
  metric: z.enum(["error_rate", "mcp_usage", "health_check", "org_over_limit", "new_signup"]),
  condition: z.enum(["gt", "lt", "eq"]),
  threshold: z.number(),
  window: z.number().int().min(1).default(10),
  channel: z.enum(["email", "whatsapp", "both"]).default("email"),
  enabled: z.boolean().default(true),
});

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (!session?.user || (session.user as any).role !== "ADMIN") {
    return null;
  }
  return session.user;
}

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const rules = await prisma.alertRule.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      events: {
        orderBy: { createdAt: "desc" },
        take: 5,
      },
    },
  });

  return NextResponse.json({ rules });
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const parsed = ruleSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { message: "Invalid payload", errors: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const { id, ...data } = parsed.data;

  let rule;
  if (id) {
    // Update existing rule
    rule = await prisma.alertRule.update({
      where: { id },
      data,
    });
  } else {
    // Create new rule
    rule = await prisma.alertRule.create({
      data,
    });
  }

  return NextResponse.json({ rule });
}

export async function DELETE(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { id } = await req.json();
  if (!id) {
    return NextResponse.json({ message: "id required" }, { status: 400 });
  }

  await prisma.alertRule.delete({ where: { id } });
  return NextResponse.json({ message: "Deleted" });
}
