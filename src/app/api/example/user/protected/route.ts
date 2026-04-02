// return hello world
import { NextResponse, NextRequest } from "next/server";
import isValidKey from "@/libs/isValidAPIKey";

export async function GET(req: NextRequest) {
	const apiKey = req.headers.get("Authorization") as string;

	if (!apiKey) {
		return new NextResponse("Missing API Key", { status: 401 });
	}

	const user = await isValidKey(apiKey);

	if (!user) {
		return new NextResponse("Invalid API Key", { status: 401 });
	}

	return NextResponse.json({
		name: "John Doe",
		description: "User example api",
	});
}
