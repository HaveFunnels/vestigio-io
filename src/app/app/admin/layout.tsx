import { authOptions } from "@/libs/auth";
import { prisma } from "@/libs/prismaDb";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

// Wave 18e — DB role revalidation. The JWT carries `role` as a cached
// snapshot from when the user signed in; if an admin is demoted in
// the database, the cached role stays "ADMIN" for up to 30 days (the
// cookie ceiling) until the user signs out + back in. That window
// kept ex-admins able to navigate /app/admin/* and read sensitive
// platform data. This layout runs on every admin page request, so a
// single Prisma point-read against User.role here closes the gap with
// negligible cost on admin traffic (which is low-volume by nature).
//
// Order matters: we check the JWT role first as a fast-path so non-
// admin users never reach the DB query. Only confirmed-by-JWT admins
// pay the round-trip — and that round-trip is what catches the
// demote-mid-session edge case the JWT cannot see.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);

  if (!session?.user || (session.user as any).role !== "ADMIN") {
    redirect("/app");
  }

  const userId = (session.user as { id?: string }).id;
  if (!userId) {
    redirect("/app");
  }

  // Fail-closed: if the DB read throws, deny admin access. An outage
  // should never grant elevated privileges; the customer-facing
  // dashboard remains reachable without admin rights so this only
  // blocks platform-admin pages.
  let dbRole: string | null = null;
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });
    dbRole = user?.role ?? null;
  } catch (err) {
    redirect("/app");
  }

  if (dbRole !== "ADMIN") {
    console.warn(
      `[admin-layout] user ${userId} has stale ADMIN role in JWT but DB role=${dbRole} — denying access`,
    );
    redirect("/app");
  }

  return <>{children}</>;
}
