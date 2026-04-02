import { sendEmail } from "@/libs/email";
import { withErrorTracking } from "@/libs/error-tracker";
import { isAuthorized } from "@/libs/isAuthorized";
import { prisma } from "@/libs/prismaDb";
import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { invitationSendSchema } from "./schema";

export const POST = withErrorTracking(async function POST(request: Request) {
	const body = await request.json();
	const res = invitationSendSchema.safeParse(body);

	if (!res.success) {
		return NextResponse.json(
			{ message: "Invalid Payload", errors: res.error.flatten().fieldErrors },
			{ status: 400 }
		);
	}

	const { email, role } = res.data;

	const isAlreadyInvited = await prisma.invitation.findUnique({
		where: { email },
	});

	if (isAlreadyInvited) {
		return NextResponse.json(
			{ message: "User already invited" },
			{ status: 409 }
		);
	}

	const user = await isAuthorized();

	if (!user || user.role !== "ADMIN") {
		return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
	}

	const token = crypto.randomBytes(32).toString("hex");

	try {
		await prisma.invitation.create({
			data: {
				email,
				token,
				role,
				expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24), // 24 hours from now
			},
		});
	} catch (error) {
		return NextResponse.json(
			{ message: "Unable to create invitation link" },
			{ status: 500 }
		);
	}

	// Send invitation email
	const inviteLink = `${process.env.NEXTAUTH_URL}/auth/invite?token=${token}`;
	try {
		await sendEmail({
			to: email,
			subject: "Invitation to Login",
			html: ` 
      <div>
        <h1>You have been invited to login to your account</h1>
        <p>Click the link below login</p>
        <a href="${inviteLink}" target="_blank">Activate Account</a>
      </div>
      `,
		});

		return NextResponse.json(
			{ message: "Invitation sent" },
			{
				status: 200,
			}
		);
	} catch (error) {
		return NextResponse.json(
			{ message: "Unable to send invitation. Please try again!" },
			{
				status: 500,
			}
		);
	}
}, { endpoint: "/api/user/invite/send", method: "POST" });
