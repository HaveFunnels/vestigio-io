import { NextResponse } from "next/server";
import { getKnowledgeArticleByRootCauseKey } from "@/sanity/sanity-utils";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const key = searchParams.get("key");

  if (!key) {
    return NextResponse.json({ error: "Missing key parameter" }, { status: 400 });
  }

  try {
    const article = await getKnowledgeArticleByRootCauseKey(key);
    if (!article) {
      return NextResponse.json({ article: null });
    }
    return NextResponse.json({
      article: {
        slug: article.slug.current,
        title: article.title,
        excerpt: article.excerpt,
      },
    });
  } catch {
    return NextResponse.json({ article: null });
  }
}
