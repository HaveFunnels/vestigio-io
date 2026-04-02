import axios, { AxiosError } from "axios";
import { NextRequest, NextResponse } from "next/server";
import { newsletterPayloadSchema } from "./schema";

export async function POST(req: NextRequest) {
	const payload = await req.json();
	const res = newsletterPayloadSchema.safeParse(payload);

	if (!res.success) {
		return NextResponse.json(
			{ message: "Invalid Payload", errors: res.error.flatten().fieldErrors },
			{ status: 400 }
		);
	}

	const MailchimpKey = process.env.MAILCHIMP_API_KEY;
	const MailchimpServer = process.env.MAILCHIMP_API_SERVER;
	const MailchimpAudience = process.env.MAILCHIMP_AUDIENCE_ID;

	const customUrl = `https://${MailchimpServer}.api.mailchimp.com/3.0/lists/${MailchimpAudience}/members`;

	try {
		const { data } = await axios.post(
			customUrl,
			{
				email_address: res.data.email,
				status: "subscribed",
			},
			{
				headers: {
					Authorization: `apikey ${MailchimpKey}`,
					"Content-Type": "application/json",
				},
			}
		);

		return NextResponse.json(data, { status: 200 });
	} catch (error) {
		if (error instanceof AxiosError) {
			return NextResponse.json(
				{
					message: "An error occurred",
					error: error.response?.data.error.detail,
				},
				{ status: error.response?.status }
			);
		}

		return NextResponse.json(
			{ error: "Internal Server Error" },
			{ status: 500 }
		);
	}
}
