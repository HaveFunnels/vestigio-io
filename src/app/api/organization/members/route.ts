import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/libs/auth";
import { prisma } from "@/libs/prismaDb";
import { withErrorTracking } from "@/libs/error-tracker";
import { z } from "zod";

// ──────────────────────────────────────────────
// Members Management — GET (list) + DELETE (remove)
//
// GET: any member can list.
// DELETE: owner only.
// ──────────────────────────────────────────────

async function resolveUserMembership(userId: string) {
  return prisma.membership.findFirst({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });
}

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

  const members = await prisma.membership.findMany({
    where: { organizationId: membership.organizationId },
    include: {
      user: {
        select: { id: true, name: true, email: true, image: true },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({
    members: members.map((m) => ({
      id: m.id,
      userId: m.userId,
      name: m.user.name,
      email: m.user.email,
      image: m.user.image,
      role: m.role,
      createdAt: m.createdAt,
    })),
  });
}, { endpoint: "/api/organization/members", method: "GET" });

const deleteSchema = z.object({
  membershipId: z.string().min(1),
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

  // Owner or admin can remove members
  if (!["owner", "admin"].includes(membership.role)) {
    return NextResponse.json({ message: "Only owners and admins can remove members" }, { status: 403 });
  }

  const body = await request.json();
  const res = deleteSchema.safeParse(body);

  if (!res.success) {
    return NextResponse.json(
      { message: "Invalid payload", errors: res.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  // Verify membership belongs to this org
  const targetMembership = await prisma.membership.findFirst({
    where: {
      id: res.data.membershipId,
      organizationId: membership.organizationId,
    },
  });

  if (!targetMembership) {
    return NextResponse.json({ message: "Member not found" }, { status: 404 });
  }

  // Cannot remove yourself
  if (targetMembership.userId === userId) {
    return NextResponse.json({ message: "Cannot remove yourself from the organization" }, { status: 400 });
  }

  // Admins cannot remove owners
  if (membership.role === "admin" && targetMembership.role === "owner") {
    return NextResponse.json({ message: "Admins cannot remove the organization owner" }, { status: 403 });
  }

  await prisma.membership.delete({
    where: { id: targetMembership.id },
  });

  return NextResponse.json({ message: "Member removed" });
}, { endpoint: "/api/organization/members", method: "DELETE" });

// ──────────────────────────────────────────────
// PATCH — change member role
// Owner can change any role. Admin can change member/viewer roles only.
// ──────────────────────────────────────────────

const patchSchema = z.object({
  membershipId: z.string().min(1),
  role: z.enum(["admin", "member", "viewer"]),
});

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

  if (!["owner", "admin"].includes(membership.role)) {
    return NextResponse.json({ message: "Insufficient permissions" }, { status: 403 });
  }

  const body = await request.json();
  const res = patchSchema.safeParse(body);

  if (!res.success) {
    return NextResponse.json(
      { message: "Invalid payload", errors: res.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const targetMembership = await prisma.membership.findFirst({
    where: {
      id: res.data.membershipId,
      organizationId: membership.organizationId,
    },
  });

  if (!targetMembership) {
    return NextResponse.json({ message: "Member not found" }, { status: 404 });
  }

  // Cannot change own role
  if (targetMembership.userId === userId) {
    return NextResponse.json({ message: "Cannot change your own role" }, { status: 400 });
  }

  // Cannot change owner role (only owner transfer can do that)
  if (targetMembership.role === "owner") {
    return NextResponse.json({ message: "Cannot change the owner's role" }, { status: 403 });
  }

  // Admins cannot promote to admin
  if (membership.role === "admin" && res.data.role === "admin") {
    return NextResponse.json({ message: "Only owners can promote members to admin" }, { status: 403 });
  }

  await prisma.membership.update({
    where: { id: targetMembership.id },
    data: { role: res.data.role },
  });

  return NextResponse.json({ message: "Role updated" });
}, { endpoint: "/api/organization/members", method: "PATCH" });
