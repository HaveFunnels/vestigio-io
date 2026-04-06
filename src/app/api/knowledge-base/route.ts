import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getKnowledgeArticles } from "@/sanity/sanity-utils";

export async function GET() {
  try {
    const cookieStore = await cookies();
    const locale = cookieStore.get("locale")?.value || "en";
    const articles = await getKnowledgeArticles(locale);
    // Strip body from listing (too large)
    const light = (articles || []).map(({ body, ...rest }) => rest);
    return NextResponse.json({ articles: light });
  } catch {
    return NextResponse.json({ articles: [] });
  }
}
