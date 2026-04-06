import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/libs/auth";
import { prisma } from "@/libs/prismaDb";

/** GET /api/support-tickets/[id] — get a single ticket (must belong to user) */
export async function GET(
  _request: Request,
  { params }: { params: { id: string } },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const ticket = await prisma.supportTicket.findFirst({
    where: {
      id: params.id,
      OR: [
        { userId: (session.user as any).id },
        { email: session.user.email },
      ],
    },
  });

  if (!ticket) {
    return NextResponse.json({ message: "Ticket not found" }, { status: 404 });
  }

  return NextResponse.json({ ticket });
}
