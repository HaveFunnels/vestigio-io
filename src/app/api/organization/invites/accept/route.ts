import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/libs/auth";
import { prisma } from "@/libs/prismaDb";
import { withErrorTracking } from "@/libs/error-tracker";
import { z } from "zod";

// ──────────────────────────────────────────────
// Accept Invite — GET (validate) + POST (accept)
//
// GET ?token=xxx: validate token, return org name + invite details.
// POST { token }: accept invite — create Membership, update OrgInvite.
// ──────────────────────────────────────────────

async function findValidInvite(token: string) {
  const invite = await prisma.orgInvite.findUnique({
    where: { token },
    include: { organization: { select: { id: true, name: true } } },
  });

  if (!invite) return { error: "Invite not found", status: 404 };
  if (invite.status !== "pending") return { error: `Invite has already been ${invite.status}`, status: 410 };
  if (invite.expiresAt < new Date()) return { error: "Invite has expired", status: 410 };

  return { invite };
}

export const GET = withErrorTracking(async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get("token");

  if (!token) {
    return NextResponse.json({ message: "Token is required" }, { status: 400 });
  }

  const result = await findValidInvite(token);
  if ("error" in result) {
    return NextResponse.json({ message: result.error }, { status: result.status });
  }

  const { invite } = result;
  return NextResponse.json({
    orgName: invite.organization.name,
    email: invite.email,
    role: invite.role,
    expiresAt: invite.expiresAt,
  });
}, { endpoint: "/api/organization/invites/accept", method: "GET" });

const acceptSchema = z.object({
  token: z.string().min(1),
});

export const POST = withErrorTracking(async function POST(request: Request) {
  const body = await request.json();
  const res = acceptSchema.safeParse(body);

  if (!res.success) {
    return NextResponse.json(
      { message: "Invalid payload", errors: res.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const { token } = res.data;

  // F4: Require authenticated session to accept invites
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json(
      { message: "Authentication required. Please sign in first.", redirect: `/signin?callbackUrl=/invite?token=${encodeURIComponent(token)}` },
      { status: 401 },
    );
  }

  const sessionEmail = (session.user as any).email;
  const sessionUserId = (session.user as any).id;

  const result = await findValidInvite(token);
  if ("error" in result) {
    return NextResponse.json({ message: result.error }, { status: result.status });
  }

  const { invite } = result;

  // F4: Enforce that the session user's email matches the invite email
  if (!sessionEmail || sessionEmail.toLowerCase() !== invite.email.toLowerCase()) {
    return NextResponse.json(
      { message: `This invite was sent to ${invite.email}. Please sign in with that email address.` },
      { status: 403 },
    );
  }

  // Use the authenticated user — do NOT auto-create accounts from unauthenticated requests
  let user = await prisma.user.findUnique({ where: { email: invite.email } });

  if (!user) {
    // The session is valid but no user record exists yet (first sign-in via OAuth).
    // Safe to create because we have verified the session email matches the invite.
    user = await prisma.user.create({
      data: {
        id: sessionUserId,
        email: invite.email,
        name: invite.email.split("@")[0],
      },
    });
  }

  // Check if membership already exists (edge case: user accepted via another path)
  const existingMembership = await prisma.membership.findUnique({
    where: { userId_organizationId: { userId: user.id, organizationId: invite.organizationId } },
  });

  if (existingMembership) {
    // Mark invite as accepted even if membership exists
    await prisma.orgInvite.update({
      where: { id: invite.id },
      data: { status: "accepted" },
    });
    return NextResponse.json({ message: "You are already a member of this organization", orgId: invite.organizationId });
  }

  // Create membership + update invite in a transaction
  await prisma.$transaction([
    prisma.membership.create({
      data: {
        userId: user.id,
        organizationId: invite.organizationId,
        role: invite.role,
      },
    }),
    prisma.orgInvite.update({
      where: { id: invite.id },
      data: { status: "accepted" },
    }),
  ]);

  return NextResponse.json({
    message: "Invitation accepted",
    orgId: invite.organizationId,
    orgName: invite.organization.name,
  });
}, { endpoint: "/api/organization/invites/accept", method: "POST" });
