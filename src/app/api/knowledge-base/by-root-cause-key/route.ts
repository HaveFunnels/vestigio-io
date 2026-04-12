import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getKnowledgeArticleByRootCauseKey } from "@/sanity/sanity-utils";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const key = searchParams.get("key");

  if (!key) {
    return NextResponse.json({ error: "Missing key parameter" }, { status: 400 });
  }

  try {
    const cookieStore = await cookies();
    const locale = cookieStore.get("locale")?.value || "en";
    const article = await getKnowledgeArticleByRootCauseKey(key, locale);
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
