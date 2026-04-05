import { NextResponse } from "next/server";
import { getKnowledgeArticleBySlug } from "@/sanity/sanity-utils";

export async function GET(
  _request: Request,
  { params }: { params: { slug: string } },
) {
  try {
    const article = await getKnowledgeArticleBySlug(params.slug);
    if (!article) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ article });
  } catch {
    return NextResponse.json({ error: "Failed to fetch article" }, { status: 500 });
  }
}
