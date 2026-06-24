import type { MetadataRoute } from "next";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
	const siteUrl = process.env.SITE_URL || "https://vestigio.io";
	const lastModified = new Date("2025-04-11");

	const routes: MetadataRoute.Sitemap = [
		{
			url: siteUrl,
			lastModified,
			changeFrequency: "weekly",
			priority: 1,
		},
		{
			url: `${siteUrl}/pricing`,
			lastModified,
			changeFrequency: "weekly",
			priority: 0.8,
		},
		{
			url: `${siteUrl}/blog`,
			lastModified,
			changeFrequency: "weekly",
			priority: 0.8,
		},
		{
			url: `${siteUrl}/support`,
			lastModified,
			changeFrequency: "monthly",
			priority: 0.5,
		},
		{
			url: `${siteUrl}/auth/signin`,
			lastModified,
			changeFrequency: "monthly",
			priority: 0.3,
		},
		{
			url: `${siteUrl}/auth/signup`,
			lastModified,
			changeFrequency: "monthly",
			priority: 0.3,
		},
	];

	// Attempt to fetch blog post slugs from Sanity
	try {
		const { getPosts } = await import("@/sanity/sanity-utils");
		const posts = await getPosts();
		if (posts?.length) {
			for (const post of posts) {
				if (post?.slug?.current) {
					routes.push({
						url: `${siteUrl}/blog/${post.slug.current}`,
						lastModified,
						changeFrequency: "weekly",
						priority: 0.6,
					});
				}
			}
		}
	} catch {
		// Sanity not configured — skip blog post URLs
	}

	// Vestigio Index — public editorial analysis. Landing +
	// vertical archives + every published essay get sitemap entries
	// so Google can discover them without depending on internal nav
	// alone. Priority bumped to 0.8 (matches /pricing) because Index
	// pages are the primary organic-discovery surface for the
	// marketing site.
	try {
		const { listAllEssays, listActiveVerticals } = await import("@/data/vestigio-index");
		const essays = listAllEssays();
		const verticals = listActiveVerticals();
		routes.push({
			url: `${siteUrl}/vestigio-index`,
			lastModified,
			changeFrequency: "weekly",
			priority: 0.8,
		});
		for (const v of verticals) {
			routes.push({
				url: `${siteUrl}/vestigio-index/${v.slug}`,
				lastModified,
				changeFrequency: "monthly",
				priority: 0.7,
			});
		}
		for (const e of essays) {
			routes.push({
				url: `${siteUrl}/vestigio-index/${e.vertical}/${e.period}/${e.slug}`,
				lastModified: new Date(e.publishedAt),
				changeFrequency: "monthly",
				priority: 0.7,
			});
		}
	} catch {
		// Data file load failed — skip the Index entries, don't fail
		// the whole sitemap
	}

	return routes;
}
