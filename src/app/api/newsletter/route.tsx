import axios, { AxiosError } from "axios";
import { NextRequest, NextResponse } from "next/server";
import { newsletterPayloadSchema } from "./schema";
import { checkRateLimit } from "@/libs/limiter";

// Tight per-IP rate limit on this public POST. The endpoint proxies
// arbitrary caller-supplied email into Mailchimp's subscribe API — the
// prior implementation had zero RL, zero auth, zero captcha. An
// attacker with a small IP pool could list-bomb inboxes with victim
// addresses (Mailchimp sends the "confirm subscription" mail on our
// list to whoever's submitted), or burn Mailchimp API quota and get
// our list flagged for reputational damage.
//
// P0.5 already fixed getIp() to canonicalize on cf-connecting-ip, so
// the IP counter here is Cloudflare-attested and not client-spoofable.
// Turnstile / hCaptcha challenge deferred to P3.3 (the bigger auth-
// surface rollout of interactive challenges).
const NEWSLETTER_RATE_LIMIT_PER_MINUTE = 3;

export async function POST(req: NextRequest) {
	const limited = await checkRateLimit(NEWSLETTER_RATE_LIMIT_PER_MINUTE, 60_000);
	if (limited) return limited;

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
