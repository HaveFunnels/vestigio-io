import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
	const siteUrl = process.env.SITE_URL || "https://vestigio.io";

	return {
		rules: [
			{
				userAgent: "*",
				allow: "/",
				disallow: ["/api/", "/app/", "/admin/", "/user/", "/studio/", "/lp/", "/scans/"],
			},
		],
		sitemap: `${siteUrl}/sitemap.xml`,
	};
}
