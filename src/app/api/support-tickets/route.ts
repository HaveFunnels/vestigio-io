import { authOptions } from "@/libs/auth";
import { getIp } from "@/libs/get-ip";
import { prisma } from "@/libs/prismaDb";
import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";

// ──────────────────────────────────────────────
// Support Tickets API
// POST — public (create ticket, no auth required)
// GET  — authenticated (fetch own tickets)
// ──────────────────────────────────────────────

// ── Sanitization helpers ──

/** Strip all HTML tags from a string */
function stripHtml(str: string): string {
  return str.replace(/<[^>]*>/g, "");
}

/** Sanitize a field: strip HTML, trim, enforce max length */
function sanitize(raw: string, maxLength: number): string {
  return stripHtml(raw).trim().slice(0, maxLength);
}

/** Basic email validation */
function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/** Count http/https URLs in text */
function countUrls(text: string): number {
  const matches = text.match(/https?:\/\//gi);
  return matches ? matches.length : 0;
}

// ── Rate limiting (in-memory) ──

const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const RATE_LIMIT_MAX = 5;

const rateLimitMap = new Map<
  string,
  { count: number; windowStart: number }
>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    rateLimitMap.set(ip, { count: 1, windowStart: now });
    return false;
  }

  entry.count += 1;
  if (entry.count > RATE_LIMIT_MAX) {
    return true;
  }

  return false;
}

// ── POST: Create a support ticket (public) ──

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Honeypot check
    if (body.website) {
      // Silently accept to not tip off bots, but do nothing
      return NextResponse.json({ id: "ok" }, { status: 201 });
    }

    const { name, email, subject, message, category } = body as {
      name?: string;
      email?: string;
      subject?: string;
      message?: string;
      category?: string;
    };

    // Required fields
    if (!name || !email || !subject || !message) {
      return NextResponse.json(
        { message: "name, email, subject, and message are required" },
        { status: 400 }
      );
    }

    // Sanitize
    const cleanName = sanitize(name, 100);
    const cleanEmail = sanitize(email, 254).toLowerCase();
    const cleanSubject = sanitize(subject, 200);
    const cleanMessage = sanitize(message, 5000);

    // Validate email
    if (!isValidEmail(cleanEmail)) {
      return NextResponse.json(
        { message: "Invalid email address" },
        { status: 400 }
      );
    }

    // Spam: reject if message has more than 3 URLs
    if (countUrls(cleanMessage) > 3) {
      return NextResponse.json(
        { message: "Message contains too many links" },
        { status: 400 }
      );
    }

    // Rate limit by IP
    const ip = (await getIp()) || "unknown";
    if (isRateLimited(ip)) {
      return NextResponse.json(
        { message: "Too many requests. Please try again later." },
        { status: 429 }
      );
    }

    // Validate category if provided
    const validCategories = ["general", "bug", "feature", "billing", "security"];
    const resolvedCategory =
      category && validCategories.includes(category) ? category : "general";

    // Try to link to existing user by email
    const existingUser = await prisma.user.findUnique({
      where: { email: cleanEmail },
      select: { id: true },
    });

    const ticket = await prisma.supportTicket.create({
      data: {
        name: cleanName,
        email: cleanEmail,
        userId: existingUser?.id || null,
        subject: cleanSubject,
        message: cleanMessage,
        status: "open",
        priority: "normal",
        category: resolvedCategory,
      },
    });

    return NextResponse.json({ id: ticket.id }, { status: 201 });
  } catch (error) {
    console.error("[support-tickets] POST error:", error);
    return NextResponse.json(
      { message: "Failed to create ticket" },
      { status: 500 }
    );
  }
}

// ── GET: Fetch own tickets (authenticated) ──

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const userId = (session.user as any).id as string | undefined;
  const userEmail = session.user.email as string | undefined;

  if (!userId && !userEmail) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const searchParams = req.nextUrl.searchParams;
  const limit = Math.min(parseInt(searchParams.get("limit") || "20", 10), 100);
  const offset = parseInt(searchParams.get("offset") || "0", 10);

  try {
    const where = {
      OR: [
        ...(userId ? [{ userId }] : []),
        ...(userEmail ? [{ email: userEmail }] : []),
      ],
    };

    const [tickets, total] = await Promise.all([
      prisma.supportTicket.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
        include: {
          _count: {
            select: { replies: true },
          },
        },
      }),
      prisma.supportTicket.count({ where }),
    ]);

    return NextResponse.json({
      tickets: tickets.map((t) => ({
        id: t.id,
        name: t.name,
        email: t.email,
        subject: t.subject,
        message: t.message,
        status: t.status,
        priority: t.priority,
        category: t.category,
        replyCount: t._count.replies,
        createdAt: t.createdAt.toISOString(),
        updatedAt: t.updatedAt.toISOString(),
      })),
      total,
      limit,
      offset,
    });
  } catch (error) {
    console.error("[support-tickets] GET error:", error);
    return NextResponse.json(
      { message: "Failed to fetch tickets" },
      { status: 500 }
    );
  }
}
