import { NextResponse } from "next/server";
import { getKnowledgeArticles } from "@/sanity/sanity-utils";

export async function GET() {
  try {
    const articles = await getKnowledgeArticles();
    // Strip body from listing (too large)
    const light = (articles || []).map(({ body, ...rest }) => rest);
    return NextResponse.json({ articles: light });
  } catch {
    return NextResponse.json({ articles: [] });
  }
}
