import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getKnowledgeArticleBySlug } from "@/sanity/sanity-utils";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;
    const cookieStore = await cookies();
    const locale = cookieStore.get("locale")?.value || "en";
    const article = await getKnowledgeArticleBySlug(slug, locale);
    if (!article) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ article });
  } catch {
    return NextResponse.json({ error: "Failed to fetch article" }, { status: 500 });
  }
}
