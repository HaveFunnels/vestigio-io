import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/libs/auth";
import { prisma } from "@/libs/prismaDb";
import { withErrorTracking } from "@/libs/error-tracker";
import { getPlanByKey } from "@/libs/plan-config";
import { sendBrevoEmail } from "@/libs/brevo";
import { renderBrandedEmail } from "@/libs/notifications";
import { z } from "zod";
import crypto from "node:crypto";

// ──────────────────────────────────────────────
// Org Invites — POST (create) + GET (list) + DELETE (revoke)
// ──────────────────────────────────────────────

async function resolveUserMembership(userId: string) {
  return prisma.membership.findFirst({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });
}

const inviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(["admin", "member", "viewer"]),
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

  // Only owner or admin can invite
  if (!["owner", "admin"].includes(membership.role)) {
    return NextResponse.json({ message: "Insufficient permissions" }, { status: 403 });
  }

  const body = await request.json();
  const res = inviteSchema.safeParse(body);

  if (!res.success) {
    return NextResponse.json(
      { message: "Invalid payload", errors: res.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const { email, role } = res.data;

  // Check if user is already a member
  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (existingUser) {
    const existingMembership = await prisma.membership.findFirst({
      where: { userId: existingUser.id, organizationId: membership.organizationId },
    });
    if (existingMembership) {
      return NextResponse.json({ message: "This user is already a member of the organization" }, { status: 409 });
    }
  }

  // Check for duplicate pending invite
  const existingInvite = await prisma.orgInvite.findUnique({
    where: { organizationId_email: { organizationId: membership.organizationId, email } },
  });
  if (existingInvite && existingInvite.status === "pending" && existingInvite.expiresAt > new Date()) {
    return NextResponse.json({ message: "An invite has already been sent to this email" }, { status: 409 });
  }

  // Seat limit check
  const org = await prisma.organization.findUnique({
    where: { id: membership.organizationId },
  });
  if (!org) {
    return NextResponse.json({ message: "Organization not found" }, { status: 404 });
  }

  const plan = await getPlanByKey(org.plan || "vestigio");
  const maxMembers = plan?.maxMembers ?? 1;

  const [memberCount, pendingInviteCount] = await Promise.all([
    prisma.membership.count({ where: { organizationId: membership.organizationId } }),
    prisma.orgInvite.count({
      where: { organizationId: membership.organizationId, status: "pending", expiresAt: { gt: new Date() } },
    }),
  ]);

  if (memberCount + pendingInviteCount >= maxMembers) {
    return NextResponse.json(
      { message: `Seat limit reached (${maxMembers}). Upgrade your plan to invite more members.`, code: "SEAT_LIMIT" },
      { status: 403 },
    );
  }

  // Generate secure token
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  // Upsert invite (handles case where previous invite was expired/revoked)
  const invite = await prisma.orgInvite.upsert({
    where: { organizationId_email: { organizationId: membership.organizationId, email } },
    update: { role, status: "pending", token, expiresAt, invitedBy: userId },
    create: {
      organizationId: membership.organizationId,
      email,
      role,
      status: "pending",
      token,
      expiresAt,
      invitedBy: userId,
    },
  });

  // Send invite email
  const acceptUrl = `${process.env.NEXTAUTH_URL || "https://vestigio.io"}/accept-invite?token=${token}`;
  const html = renderBrandedEmail({
    headline: `You're invited to join ${org.name}`,
    intro: `You've been invited to join <strong>${org.name}</strong> on Vestigio as a <strong>${role}</strong>. Click the button below to accept the invitation.`,
    ctaLabel: "Accept Invitation",
    ctaUrl: acceptUrl,
    footerNote: "This invitation expires in 7 days. If you didn't expect this, you can safely ignore this email.",
  });

  const emailResult = await sendBrevoEmail({
    to: email,
    subject: `You're invited to join ${org.name} on Vestigio`,
    html,
    tags: ["org-invite"],
    senderProfile: "noreply",
  });

  if (!emailResult.ok) {
    console.error(`[org-invites] Failed to send invite email to ${email}: ${emailResult.error}`);
    // The invite record was created, but email delivery failed.
    // Return 201 with a warning so the UI can inform the user.
    return NextResponse.json(
      {
        message: "Invite created but email delivery failed. The user can still accept via the invite link.",
        invite: { id: invite.id, email, role, expiresAt },
        emailError: emailResult.error,
      },
      { status: 201 },
    );
  }

  return NextResponse.json(
    { message: "Invitation sent", invite: { id: invite.id, email, role, expiresAt } },
    { status: 201 },
  );
}, { endpoint: "/api/organization/invites", method: "POST" });

export const GET = withErrorTracking(async function GET() {
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

  const invites = await prisma.orgInvite.findMany({
    where: { organizationId: membership.organizationId },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({
    invites: invites.map((inv) => ({
      id: inv.id,
      email: inv.email,
      role: inv.role,
      status: inv.status,
      expiresAt: inv.expiresAt,
      createdAt: inv.createdAt,
    })),
  });
}, { endpoint: "/api/organization/invites", method: "GET" });

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

  if (!["owner", "admin"].includes(membership.role)) {
    return NextResponse.json({ message: "Insufficient permissions" }, { status: 403 });
  }

  const body = await request.json();
  const { inviteId } = body;

  if (!inviteId) {
    return NextResponse.json({ message: "inviteId is required" }, { status: 400 });
  }

  const invite = await prisma.orgInvite.findFirst({
    where: { id: inviteId, organizationId: membership.organizationId },
  });

  if (!invite) {
    return NextResponse.json({ message: "Invite not found" }, { status: 404 });
  }

  await prisma.orgInvite.update({
    where: { id: inviteId },
    data: { status: "revoked" },
  });

  return NextResponse.json({ message: "Invite revoked" });
}, { endpoint: "/api/organization/invites", method: "DELETE" });
