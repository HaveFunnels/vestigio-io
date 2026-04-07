import { Blog } from "@/types/blog";
import {
	postQuery,
	postQueryBySlug,
	postQueryByTag,
	postQueryByAuthor,
	postQueryByCategory,
	kbAllQuery,
	kbAllByLocaleQuery,
	kbBySlugQuery,
	kbBySlugAndLocaleQuery,
	kbByCategoryQuery,
	kbByFindingKeyQuery,
	kbByRootCauseKeyQuery,
} from "./sanity-query";
import {
	getFoundationArticleByFindingKey,
	getFoundationArticleByRootCauseKey,
	getFoundationArticleBySlug,
	listFoundationArticles,
	type FoundationArticle,
} from "../../packages/knowledge/foundation-articles";

const SANITY_ENABLED = !!(
	typeof process !== "undefined" &&
	process.env.NEXT_PUBLIC_SANITY_PROJECT_ID &&
	process.env.NEXT_PUBLIC_SANITY_PROJECT_ID !== "disabled"
);

function getClientConfig() {
	return {
		projectId: process.env.NEXT_PUBLIC_SANITY_PROJECT_ID || "",
		dataset: "production",
		apiVersion: "2023-03-09",
		useCdn: false,
		token: process.env.SANITY_API_KEY || "",
	};
}

export async function sanityFetch<QueryResponse>({
	query,
	qParams,
	tags,
}: {
	query: string;
	qParams: Record<string, any>;
	tags: string[];
}): Promise<QueryResponse> {
	if (!SANITY_ENABLED) return {} as QueryResponse;

	const { createClient } = await import("next-sanity");
	const client = createClient(getClientConfig());
	return client.fetch<QueryResponse>(query, qParams, {
		cache: "force-cache",
		next: { tags },
	});
}

export function imageBuilder(source: string) {
	if (!SANITY_ENABLED) {
		return { url: () => "/images/placeholder.svg" } as any;
	}
	const ImageUrlBuilder = require("@sanity/image-url").default;
	return ImageUrlBuilder(getClientConfig()).image(source);
}

export const getPosts = async () => {
	const data: Blog[] = await sanityFetch({
		query: postQuery,
		qParams: {},
		tags: ["post", "author", "category"],
	});
	return data;
};

export const getPostBySlug = async (slug: string) => {
	const data: Blog = await sanityFetch({
		query: postQueryBySlug,
		qParams: { slug },
		tags: ["post", "author", "category"],
	});

	return data;
};

export const getPostsByTag = async (tag: string) => {
	const data: Blog[] = await sanityFetch({
		query: postQueryByTag,
		qParams: { slug: tag },
		tags: ["post", "author", "category"],
	});

	return data;
};

export const getPostsByAuthor = async (slug: string) => {
	const data: Blog[] = await sanityFetch({
		query: postQueryByAuthor,
		qParams: { slug },
		tags: ["post", "author", "category"],
	});

	return data;
};

export const getPostsByCategory = async (category: string) => {
	const data: Blog[] = await sanityFetch({
		query: postQueryByCategory,
		qParams: { category },
		tags: ["post", "author", "category"],
	});

	return data;
};

export const getAuthorBySlug = async (slug: string) => {
	const data = await sanityFetch({
		query: `*[_type == "author" && slug.current == $slug][0]`,
		qParams: { slug },
		tags: ["author"],
	});

	return data;
};

// ── Knowledge Base ──

export interface KnowledgeArticle {
	_id: string;
	title: string;
	slug: { current: string };
	category: "get_started" | "concept" | "pack" | "finding" | "api" | "guide";
	locale?: string;
	finding_key?: string;
	root_cause_key?: string;
	excerpt?: string;
	body: any[];
	publishedAt?: string;
}

/**
 * Adapt a programmatically generated foundation article to the
 * KnowledgeArticle shape so it can be returned alongside Sanity-authored
 * content. Foundation articles are bilingual-neutral (English) and
 * always carry the `is_foundation` marker so the consumer can tell.
 */
function foundationToKnowledgeArticle(article: FoundationArticle): KnowledgeArticle & { is_foundation: true } {
	return {
		_id: article._id,
		title: article.title,
		slug: article.slug,
		category: article.category,
		locale: "en",
		finding_key: article.finding_key,
		root_cause_key: article.root_cause_key,
		excerpt: article.excerpt,
		body: article.body,
		publishedAt: undefined,
		is_foundation: true,
	};
}

/**
 * Deduplicate articles by slug — prefer the user's locale over "en".
 * If both pt-BR and en versions of "welcome" exist, keep only pt-BR.
 */
function dedupeBySlug(articles: KnowledgeArticle[], locale: string): KnowledgeArticle[] {
	const bySlug = new Map<string, KnowledgeArticle>();
	for (const a of articles) {
		const slug = a.slug.current;
		const existing = bySlug.get(slug);
		if (!existing) {
			bySlug.set(slug, a);
		} else {
			// Prefer the locale-specific version
			const existingLocale = existing.locale || "en";
			const newLocale = a.locale || "en";
			if (newLocale === locale && existingLocale !== locale) {
				bySlug.set(slug, a);
			}
		}
	}
	return Array.from(bySlug.values());
}

export const getKnowledgeArticles = async (locale = "en"): Promise<KnowledgeArticle[]> => {
	const articles = await sanityFetch<KnowledgeArticle[]>({
		query: kbAllByLocaleQuery,
		qParams: { locale },
		tags: ["knowledgeArticle"],
	});
	const sanityArticles = dedupeBySlug(articles || [], locale);

	// Merge in foundation articles. Sanity-authored articles take
	// precedence on slug conflict so writers can override the
	// programmatic foundation with richer hand-authored content.
	const sanitySlugs = new Set(sanityArticles.map((a) => a.slug.current));
	const foundationArticles = listFoundationArticles()
		.map(foundationToKnowledgeArticle)
		.filter((a) => !sanitySlugs.has(a.slug.current));

	return [...sanityArticles, ...foundationArticles];
};

export const getKnowledgeArticleBySlug = async (
	slug: string,
	locale = "en",
): Promise<KnowledgeArticle | null> => {
	const article = await sanityFetch<KnowledgeArticle | null>({
		query: kbBySlugAndLocaleQuery,
		qParams: { slug, locale },
		tags: ["knowledgeArticle"],
	});
	if (article) return article;

	// Fall back to foundation article if Sanity has no match
	const foundation = getFoundationArticleBySlug(slug);
	return foundation ? foundationToKnowledgeArticle(foundation) : null;
};

export const getKnowledgeArticlesByCategory = async (
	category: string,
): Promise<KnowledgeArticle[]> => {
	return sanityFetch<KnowledgeArticle[]>({
		query: kbByCategoryQuery,
		qParams: { category },
		tags: ["knowledgeArticle"],
	});
};

export const getKnowledgeArticleByFindingKey = async (
	findingKey: string,
	locale = "en",
): Promise<KnowledgeArticle | null> => {
	const article = await sanityFetch<KnowledgeArticle | null>({
		query: kbByFindingKeyQuery,
		qParams: { findingKey, locale },
		tags: ["knowledgeArticle"],
	});
	if (article) return article;

	// Fall back to foundation article — every inference_key has one
	const foundation = getFoundationArticleByFindingKey(findingKey);
	return foundation ? foundationToKnowledgeArticle(foundation) : null;
};

export const getKnowledgeArticleByRootCauseKey = async (
	rootCauseKey: string,
): Promise<KnowledgeArticle | null> => {
	const article = await sanityFetch<KnowledgeArticle | null>({
		query: kbByRootCauseKeyQuery,
		qParams: { rootCauseKey },
		tags: ["knowledgeArticle"],
	});
	if (article) return article;

	// Fall back to foundation article — every root_cause_key has one
	const foundation = getFoundationArticleByRootCauseKey(rootCauseKey);
	return foundation ? foundationToKnowledgeArticle(foundation) : null;
};
