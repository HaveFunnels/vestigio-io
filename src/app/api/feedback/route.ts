import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/libs/auth";
import { prisma } from "@/libs/prismaDb";

const VALID_TYPES = ["general", "bug", "feature", "ux", "performance", "contextual", "nps"];

/** POST /api/feedback — authenticated feedback submission */
export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const type = VALID_TYPES.includes(body.type) ? body.type : "general";
  const content = (body.content || "").trim().slice(0, 5000);
  const title = body.title ? String(body.title).trim().slice(0, 200) : null;
  const rating = typeof body.rating === "number" && body.rating >= 0 && body.rating <= 10
    ? body.rating
    : null;
  const page = body.page ? String(body.page).slice(0, 500) : null;

  if (!content) {
    return NextResponse.json({ message: "Content is required" }, { status: 400 });
  }

  const feedback = await prisma.feedback.create({
    data: {
      userId: (session.user as any).id || null,
      userEmail: session.user.email,
      userName: session.user.name || null,
      type,
      title,
      content,
      rating,
      page,
      status: "new",
    },
  });

  return NextResponse.json({ id: feedback.id }, { status: 201 });
}
