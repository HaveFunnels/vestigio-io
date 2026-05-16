import { authOptions } from "@/libs/auth";
import { logAuditEvent } from "@/libs/audit-log";
import { getIp } from "@/libs/get-ip";
import { prisma } from "@/libs/prismaDb";
import bcrypt from "bcryptjs";
import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";

// ──────────────────────────────────────────────
// Admin Users API
// GET    — list admin users + total user count
// POST   — invite/create a new admin
// PATCH  — update admin role or name
// DELETE — demote admin to regular user
// ──────────────────────────────────────────────

/** Check if the session user is a super_admin or has ADMIN role */
async function getAdminSession() {
  const session = await getServerSession(authOptions);

  if (!session?.user || (session.user as any).role !== "ADMIN") {
    return null;
  }

  // Wave 18e — also verify role from DB to catch ex-admins whose JWT
  // is still cached as ADMIN. Without this, an admin demoted in DB
  // keeps full power over admin user management (promote/demote
  // others, list admins, invite admins) until their cookie ceiling
  // hits — which is the most sensitive of all admin surfaces.
  const user = await prisma.user.findUnique({
    where: { id: (session.user as any).id },
    select: { id: true, role: true, adminRole: true, name: true, email: true },
  });

  if (!user || user.role !== "ADMIN") {
    if (user && user.role !== "ADMIN") {
      console.warn(
        `[admin-users] user ${user.id} has stale ADMIN role in JWT but DB role=${user.role} — denied`,
      );
    }
    return null;
  }

  return { session, user };
}

// ── GET: List admin users ──

export async function GET(req: NextRequest) {
  const admin = await getAdminSession();

  if (!admin) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  try {
    const [admins, totalUsers] = await Promise.all([
      prisma.user.findMany({
        where: { role: "ADMIN" },
        select: {
          id: true,
          name: true,
          email: true,
          adminRole: true,
          createdAt: true,
        },
        orderBy: { createdAt: "asc" },
      }),
      prisma.user.count(),
    ]);

    return NextResponse.json({
      admins: admins.map((a) => ({
        id: a.id,
        name: a.name,
        email: a.email,
        adminRole: a.adminRole,
        createdAt: a.createdAt.toISOString(),
      })),
      totalUsers,
    });
  } catch (error) {
    console.error("[admin/users] GET error:", error);
    return NextResponse.json(
      { message: "Failed to fetch admin users" },
      { status: 500 }
    );
  }
}

// ── POST: Create/invite a new admin user ──

export async function POST(req: NextRequest) {
  const admin = await getAdminSession();

  if (!admin) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  // Only super_admin can create new admins
  if (admin.user.adminRole !== "super_admin") {
    return NextResponse.json(
      { message: "Only super admins can invite new admins" },
      { status: 403 }
    );
  }

  try {
    const body = await req.json();
    const { email, name, adminRole, password } = body as {
      email?: string;
      name?: string;
      adminRole?: string;
      password?: string;
    };

    if (!email || !name || !adminRole || !password) {
      return NextResponse.json(
        { message: "email, name, adminRole, and password are required" },
        { status: 400 }
      );
    }

    // Only two roles are actually enforced today (super_admin gets admin
    // user-management privileges; "admin" gets everything else). The
    // earlier granular roles (support/marketing/viewer/billing) had no
    // enforcement so they're no longer accepted on write. Existing DB
    // rows with those values remain unchanged and render as "Admin".
    const validAdminRoles = ["super_admin", "admin"];
    if (!validAdminRoles.includes(adminRole)) {
      return NextResponse.json(
        { message: `Invalid adminRole. Must be one of: ${validAdminRoles.join(", ")}` },
        { status: 400 }
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        { message: "Password must be at least 8 characters" },
        { status: 400 }
      );
    }

    // Check if user already exists
    const existing = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (existing) {
      return NextResponse.json(
        { message: "A user with this email already exists" },
        { status: 409 }
      );
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    const newAdmin = await prisma.user.create({
      data: {
        email: email.toLowerCase(),
        name,
        role: "ADMIN",
        adminRole,
        password: hashedPassword,
      },
    });

    // Audit trail — sensitive op (admin user creation).
    const ip = await getIp();
    logAuditEvent({
      actorId: admin.user.id,
      actorEmail: admin.user.email ?? "unknown",
      action: "user.invite",
      targetType: "user",
      targetId: newAdmin.id,
      targetName: newAdmin.email ?? undefined,
      metadata: { adminRole },
      ipAddress: ip ?? undefined,
    });

    return NextResponse.json(
      {
        admin: {
          id: newAdmin.id,
          name: newAdmin.name,
          email: newAdmin.email,
          adminRole: newAdmin.adminRole,
          createdAt: newAdmin.createdAt.toISOString(),
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("[admin/users] POST error:", error);
    return NextResponse.json(
      { message: "Failed to create admin user" },
      { status: 500 }
    );
  }
}

// ── PATCH: Update admin user role or name ──

export async function PATCH(req: NextRequest) {
  const admin = await getAdminSession();

  if (!admin) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  // Only super_admin can change roles
  if (admin.user.adminRole !== "super_admin") {
    return NextResponse.json(
      { message: "Only super admins can modify admin users" },
      { status: 403 }
    );
  }

  try {
    const body = await req.json();
    const { userId, adminRole, name } = body as {
      userId?: string;
      adminRole?: string;
      name?: string;
    };

    if (!userId) {
      return NextResponse.json(
        { message: "userId is required" },
        { status: 400 }
      );
    }

    // Cannot change own role
    if (userId === admin.user.id && adminRole) {
      return NextResponse.json(
        { message: "Cannot change your own admin role" },
        { status: 400 }
      );
    }

    // Only two roles are actually enforced today (super_admin gets admin
    // user-management privileges; "admin" gets everything else). The
    // earlier granular roles (support/marketing/viewer/billing) had no
    // enforcement so they're no longer accepted on write. Existing DB
    // rows with those values remain unchanged and render as "Admin".
    const validAdminRoles = ["super_admin", "admin"];
    const data: Record<string, string> = {};

    if (adminRole) {
      if (!validAdminRoles.includes(adminRole)) {
        return NextResponse.json(
          { message: `Invalid adminRole. Must be one of: ${validAdminRoles.join(", ")}` },
          { status: 400 }
        );
      }
      data.adminRole = adminRole;
    }

    if (name) {
      data.name = name.trim();
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json(
        { message: "No valid fields to update" },
        { status: 400 }
      );
    }

    // Verify the target user is an admin
    const targetUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true },
    });

    if (!targetUser || targetUser.role !== "ADMIN") {
      return NextResponse.json(
        { message: "Target user is not an admin" },
        { status: 404 }
      );
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data,
      select: {
        id: true,
        name: true,
        email: true,
        adminRole: true,
        createdAt: true,
      },
    });

    // Audit trail — sensitive op (role change). Always log when adminRole
    // is included in the patch so reviewers can match invites + role
    // changes in the audit-log filter.
    if (adminRole) {
      const ip = await getIp();
      logAuditEvent({
        actorId: admin.user.id,
        actorEmail: admin.user.email ?? "unknown",
        action: "user.role_change",
        targetType: "user",
        targetId: updated.id,
        targetName: updated.email ?? undefined,
        metadata: { adminRole },
        ipAddress: ip ?? undefined,
      });
    }

    return NextResponse.json({
      admin: {
        id: updated.id,
        name: updated.name,
        email: updated.email,
        adminRole: updated.adminRole,
        createdAt: updated.createdAt.toISOString(),
      },
    });
  } catch (error) {
    console.error("[admin/users] PATCH error:", error);
    return NextResponse.json(
      { message: "Failed to update admin user" },
      { status: 500 }
    );
  }
}

// ── DELETE: Demote admin to regular user ──

export async function DELETE(req: NextRequest) {
  const admin = await getAdminSession();

  if (!admin) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  // Only super_admin can remove admins
  if (admin.user.adminRole !== "super_admin") {
    return NextResponse.json(
      { message: "Only super admins can remove admin access" },
      { status: 403 }
    );
  }

  try {
    const body = await req.json();
    const { userId } = body as { userId?: string };

    if (!userId) {
      return NextResponse.json(
        { message: "userId is required" },
        { status: 400 }
      );
    }

    // Cannot remove self
    if (userId === admin.user.id) {
      return NextResponse.json(
        { message: "Cannot remove your own admin access" },
        { status: 400 }
      );
    }

    // Verify the target is actually an admin
    const targetUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true },
    });

    if (!targetUser || targetUser.role !== "ADMIN") {
      return NextResponse.json(
        { message: "Target user is not an admin" },
        { status: 404 }
      );
    }

    const removed = await prisma.user.update({
      where: { id: userId },
      data: {
        role: "USER",
        adminRole: null,
      },
      select: { id: true, email: true },
    });

    // Audit trail — sensitive op (admin removal). Matches the `user.delete`
    // entry shown in the audit-log filter dropdown.
    const ip = await getIp();
    logAuditEvent({
      actorId: admin.user.id,
      actorEmail: admin.user.email ?? "unknown",
      action: "user.delete",
      targetType: "user",
      targetId: removed.id,
      targetName: removed.email ?? undefined,
      ipAddress: ip ?? undefined,
    });

    return NextResponse.json({
      message: "Admin access removed successfully",
    });
  } catch (error) {
    console.error("[admin/users] DELETE error:", error);
    return NextResponse.json(
      { message: "Failed to remove admin access" },
      { status: 500 }
    );
  }
}
