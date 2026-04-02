import { authOptions } from "@/libs/auth";
import { withErrorTracking } from "@/libs/error-tracker";
import { stripe } from "@/stripe/stripe";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { z } from "zod";

const schema = z.object({
  subscriptionId: z.string().min(1),
});

export const POST = withErrorTracking(async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const res = schema.safeParse(body);

  if (!res.success) {
    return NextResponse.json(
      { message: "Invalid payload", errors: res.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const { subscriptionId } = res.data;

  // Verify the subscription belongs to the authenticated user
  if ((session.user as any).subscriptionId !== subscriptionId) {
    return NextResponse.json(
      { message: "Forbidden: subscription does not belong to this user" },
      { status: 403 },
    );
  }

  try {
    const canceled = await stripe.subscriptions.cancel(subscriptionId);

    return NextResponse.json({
      message: "Subscription canceled successfully",
      data: {
        id: canceled.id,
        status: canceled.status,
        canceledAt: canceled.canceled_at,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { message: error?.message || "Failed to cancel subscription" },
      { status: error?.statusCode || 500 },
    );
  }
}, { endpoint: "/api/stripe/cancel-subscription", method: "POST" });
