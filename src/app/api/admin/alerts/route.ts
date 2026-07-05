import { logAuditEvent } from "@/libs/audit-log";
import { getIp } from "@/libs/get-ip";
import { prisma } from "@/libs/prismaDb";
import { requireAdmin } from "@/libs/require-admin";
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
  metric: z.enum(["error_rate", "mcp_usage", "org_over_limit", "new_signup"]),
  condition: z.enum(["gt", "lt", "eq"]),
  threshold: z.number(),
  window: z.number().int().min(1).default(10),
  channel: z.enum(["email", "whatsapp", "both"]).default("email"),
  enabled: z.boolean().default(true),
});

export async function GET() {
  const gate = await requireAdmin();
  if (gate.denied) return gate.denied;

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
  const gate = await requireAdmin();
  if (gate.denied) return gate.denied;

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

  // Audit trail — matches the "alert.create" / "alert.update" entries
  // exposed in the audit-log filter dropdown. Earlier these filter
  // options existed but no code path emitted them.
  const ip = await getIp();
  logAuditEvent({
    actorId: gate.admin.userId,
    actorEmail: gate.admin.email ?? "unknown",
    action: id ? "alert.update" : "alert.create",
    targetType: "alert_rule",
    targetId: rule.id,
    targetName: rule.name,
    metadata: { metric: data.metric, condition: data.condition, threshold: data.threshold },
    ipAddress: ip ?? undefined,
  });

  return NextResponse.json({ rule });
}

export async function DELETE(req: NextRequest) {
  const gate = await requireAdmin();
  if (gate.denied) return gate.denied;

  const { id } = await req.json();
  if (!id) {
    return NextResponse.json({ message: "id required" }, { status: 400 });
  }

  const deleted = await prisma.alertRule.delete({
    where: { id },
    select: { id: true, name: true },
  });

  const ip = await getIp();
  logAuditEvent({
    actorId: gate.admin.userId,
    actorEmail: gate.admin.email ?? "unknown",
    action: "alert.delete",
    targetType: "alert_rule",
    targetId: deleted.id,
    targetName: deleted.name,
    ipAddress: ip ?? undefined,
  });

  return NextResponse.json({ message: "Deleted" });
}
