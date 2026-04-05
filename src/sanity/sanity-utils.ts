import { Blog } from "@/types/blog";
import {
	postQuery,
	postQueryBySlug,
	postQueryByTag,
	postQueryByAuthor,
	postQueryByCategory,
	kbAllQuery,
	kbBySlugQuery,
	kbByCategoryQuery,
	kbByFindingKeyQuery,
	kbByRootCauseKeyQuery,
} from "./sanity-query";

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
	category: "concept" | "pack" | "finding" | "guide";
	finding_key?: string;
	root_cause_key?: string;
	excerpt?: string;
	body: any[];
	publishedAt?: string;
}

export const getKnowledgeArticles = async (): Promise<KnowledgeArticle[]> => {
	return sanityFetch<KnowledgeArticle[]>({
		query: kbAllQuery,
		qParams: {},
		tags: ["knowledgeArticle"],
	});
};

export const getKnowledgeArticleBySlug = async (
	slug: string,
): Promise<KnowledgeArticle | null> => {
	return sanityFetch<KnowledgeArticle | null>({
		query: kbBySlugQuery,
		qParams: { slug },
		tags: ["knowledgeArticle"],
	});
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
): Promise<KnowledgeArticle | null> => {
	return sanityFetch<KnowledgeArticle | null>({
		query: kbByFindingKeyQuery,
		qParams: { findingKey },
		tags: ["knowledgeArticle"],
	});
};

export const getKnowledgeArticleByRootCauseKey = async (
	rootCauseKey: string,
): Promise<KnowledgeArticle | null> => {
	return sanityFetch<KnowledgeArticle | null>({
		query: kbByRootCauseKeyQuery,
		qParams: { rootCauseKey },
		tags: ["knowledgeArticle"],
	});
};
