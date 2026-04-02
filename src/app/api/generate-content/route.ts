import { authOptions } from "@/libs/auth";
import { withErrorTracking } from "@/libs/error-tracker";
import { getServerSession } from "next-auth";
import OpenAI from "openai";

export const POST = withErrorTracking(async function POST(req: Request) {
	const session = await getServerSession(authOptions);

	if (!session?.user) {
		return new Response(JSON.stringify({ message: "Unauthorized" }), {
			status: 401,
		});
	}

	const body = await req.json();
	const { prompt } = body;

	if (!prompt || !Array.isArray(prompt)) {
		return new Response(JSON.stringify({ message: "Invalid prompt" }), {
			status: 400,
		});
	}

	const openai = new OpenAI({
		apiKey: process.env.OPENAI_API_KEY,
	});

	try {
		const chatCompletion = await openai.chat.completions.create({
			messages: prompt,
			model: "gpt-3.5-turbo",
			temperature: 1,
			top_p: 1,
			frequency_penalty: 0,
			presence_penalty: 0,
		});

		const generatedContent = chatCompletion.choices[0].message?.content;

		return new Response(JSON.stringify(generatedContent));
	} catch (error: any) {
		return new Response(
			JSON.stringify({ message: "Content generation failed" }),
			{ status: 500 }
		);
	}
}, { endpoint: "/api/generate-content", method: "POST" });
