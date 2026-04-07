import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/libs/auth";
import { prisma } from "@/libs/prismaDb";

/** GET /api/support-tickets/[id]/replies — list replies for a user's ticket */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  // Verify ticket belongs to user
  const ticket = await prisma.supportTicket.findFirst({
    where: {
      id,
      OR: [
        { userId: (session.user as any).id },
        { email: session.user.email },
      ],
    },
  });

  if (!ticket) {
    return NextResponse.json({ message: "Ticket not found" }, { status: 404 });
  }

  const replies = await prisma.ticketReply.findMany({
    where: { ticketId: id },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({ replies });
}

/** POST /api/support-tickets/[id]/replies — user replies to their own ticket */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const userId = (session.user as any).id;

  // Verify ticket belongs to user
  const ticket = await prisma.supportTicket.findFirst({
    where: {
      id,
      OR: [
        { userId },
        { email: session.user.email },
      ],
    },
  });

  if (!ticket) {
    return NextResponse.json({ message: "Ticket not found" }, { status: 404 });
  }

  if (ticket.status === "closed" || ticket.status === "resolved") {
    return NextResponse.json({ message: "Ticket is closed" }, { status: 400 });
  }

  const body = await request.json();
  const content = (body.content || "").trim().slice(0, 5000);

  if (!content) {
    return NextResponse.json({ message: "Content is required" }, { status: 400 });
  }

  const reply = await prisma.ticketReply.create({
    data: {
      ticketId: id,
      authorId: userId,
      authorName: session.user.name || "User",
      authorEmail: session.user.email,
      content,
      isStaff: false,
    },
  });

  // Reopen ticket if it was resolved
  if (ticket.status !== "open" && ticket.status !== "in_progress") {
    await prisma.supportTicket.update({
      where: { id },
      data: { status: "open" },
    });
  }

  return NextResponse.json({ reply }, { status: 201 });
}
