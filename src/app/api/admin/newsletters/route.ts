import { authOptions } from "@/libs/auth";
import { withErrorTracking } from "@/libs/error-tracker";
import { prisma } from "@/libs/prismaDb";
import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/admin/newsletters — list newsletters with pagination
 * Query params: page (number), limit (number)
 */
export const GET = withErrorTracking(async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session?.user || (session.user as any).role !== "ADMIN") {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const searchParams = req.nextUrl.searchParams;
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
  const limit = Math.min(50, Math.max(1, parseInt(searchParams.get("limit") || "20", 10)));
  const skip = (page - 1) * limit;

  try {
    const [newsletters, total] = await Promise.all([
      prisma.newsletter.findMany({
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.newsletter.count(),
    ]);

    return NextResponse.json({
      newsletters: newsletters.map((n) => ({
        id: n.id,
        subject: n.subject,
        content: n.content,
        audience: n.audience,
        status: n.status,
        recipientCount: n.recipientCount,
        sentAt: n.sentAt?.toISOString() ?? null,
        createdAt: n.createdAt.toISOString(),
        updatedAt: n.updatedAt.toISOString(),
      })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch {
    return NextResponse.json(
      { message: "Failed to fetch newsletters" },
      { status: 500 },
    );
  }
}, { endpoint: "/api/admin/newsletters", method: "GET" });

/**
 * POST /api/admin/newsletters — create a new newsletter (draft or send immediately)
 * Body: { subject, content, audience?, sendNow?: boolean }
 */
export const POST = withErrorTracking(async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session?.user || (session.user as any).role !== "ADMIN") {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { subject, content, audience, sendNow } = body as {
      subject?: string;
      content?: string;
      audience?: string;
      sendNow?: boolean;
    };

    if (!subject || !subject.trim()) {
      return NextResponse.json(
        { message: "Subject is required" },
        { status: 400 },
      );
    }

    if (!content || !content.trim()) {
      return NextResponse.json(
        { message: "Content is required" },
        { status: 400 },
      );
    }

    const validAudiences = ["all", "free", "pro", "max"];
    const resolvedAudience = validAudiences.includes(audience || "") ? audience! : "all";

    // Count recipients based on audience
    let recipientCount = 0;
    if (sendNow) {
      const planFilter: Record<string, string | undefined> = {
        all: undefined,
        free: "vestigio",
        pro: "pro",
        max: "max",
      };
      const planValue = planFilter[resolvedAudience];

      if (planValue) {
        recipientCount = await prisma.organization.count({
          where: { plan: planValue, status: "active" },
        });
      } else {
        recipientCount = await prisma.organization.count({
          where: { status: "active" },
        });
      }
    }

    const newsletter = await prisma.newsletter.create({
      data: {
        subject: subject.trim(),
        content: content.trim(),
        audience: resolvedAudience,
        status: sendNow ? "sent" : "draft",
        recipientCount: sendNow ? recipientCount : null,
        sentAt: sendNow ? new Date() : null,
      },
    });

    return NextResponse.json({
      newsletter: {
        id: newsletter.id,
        subject: newsletter.subject,
        content: newsletter.content,
        audience: newsletter.audience,
        status: newsletter.status,
        recipientCount: newsletter.recipientCount,
        sentAt: newsletter.sentAt?.toISOString() ?? null,
        createdAt: newsletter.createdAt.toISOString(),
        updatedAt: newsletter.updatedAt.toISOString(),
      },
    }, { status: 201 });
  } catch {
    return NextResponse.json(
      { message: "Failed to create newsletter" },
      { status: 500 },
    );
  }
}, { endpoint: "/api/admin/newsletters", method: "POST" });
