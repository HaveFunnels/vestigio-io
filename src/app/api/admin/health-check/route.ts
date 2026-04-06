import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/libs/auth";
import { runAndPersistHealthChecks, runHealthChecks } from "@/libs/health-checker";

/**
 * GET /api/admin/health-check — Run health checks NOW.
 *
 * Two modes:
 *   - With admin session: runs checks, persists, returns results
 *   - With ?cron=SECRET header: for external cron (Railway cron job)
 */
export async function GET(req: NextRequest) {
  const cronSecret = req.nextUrl.searchParams.get("cron");

  // Allow external cron with secret
  if (cronSecret) {
    const expected = process.env.HEALTH_CHECK_SECRET || process.env.SECRET;
    if (cronSecret !== expected) {
      return NextResponse.json({ error: "Invalid secret" }, { status: 401 });
    }
    const results = await runAndPersistHealthChecks();
    return NextResponse.json({ results, persisted: true });
  }

  // Otherwise require admin session
  const session = await getServerSession(authOptions);
  if (!session?.user || (session.user as any).role !== "ADMIN") {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const persist = req.nextUrl.searchParams.get("persist") !== "false";

  const results = persist
    ? await runAndPersistHealthChecks()
    : await runHealthChecks();

  return NextResponse.json({ results, persisted: persist });
}
