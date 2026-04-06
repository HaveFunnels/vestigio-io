const knowledgeArticle = {
	name: "knowledgeArticle",
	title: "Knowledge Article",
	type: "document",
	fields: [
		{
			name: "title",
			title: "Title",
			type: "string",
			validation: (Rule: any) => Rule.required(),
		},
		{
			name: "slug",
			title: "Slug",
			type: "slug",
			options: {
				source: "title",
				slugify: (input: any) =>
					input
						.toLowerCase()
						.replace(/\s+/g, "-")
						.replace(/[^\w-]+/g, ""),
			},
			validation: (Rule: any) => Rule.required(),
		},
		{
			name: "category",
			title: "Category",
			type: "string",
			options: {
				list: [
					{ title: "Get Started", value: "get_started" },
					{ title: "Concept", value: "concept" },
					{ title: "Pack", value: "pack" },
					{ title: "Finding", value: "finding" },
					{ title: "API Reference", value: "api" },
					{ title: "Guide", value: "guide" },
				],
			},
			validation: (Rule: any) => Rule.required(),
		},
		{
			name: "order",
			title: "Sort Order",
			description: "Lower numbers appear first within the same category.",
			type: "number",
			initialValue: 100,
		},
		{
			name: "finding_key",
			title: "Finding Key",
			description:
				"Optional. Links this article to a specific finding inference key (e.g. thin_refund_policy).",
			type: "string",
		},
		{
			name: "root_cause_key",
			title: "Root Cause Key",
			description:
				"Optional. Links this article to a specific root cause key.",
			type: "string",
		},
		{
			name: "excerpt",
			title: "Excerpt",
			description: "Short description shown in listings and search results.",
			type: "text",
			rows: 3,
		},
		{
			name: "body",
			title: "Body",
			type: "blockContent",
			validation: (Rule: any) => Rule.required(),
		},
		{
			name: "locale",
			title: "Locale",
			description: "Language of this article. Defaults to English.",
			type: "string",
			options: {
				list: [
					{ title: "English", value: "en" },
					{ title: "Portugues (BR)", value: "pt-BR" },
					{ title: "Espanol", value: "es" },
					{ title: "Deutsch", value: "de" },
				],
			},
			initialValue: "en",
		},
		{
			name: "publishedAt",
			title: "Published At",
			type: "datetime",
		},
	],
	orderings: [
		{
			title: "Category, then Order",
			name: "categoryOrder",
			by: [
				{ field: "category", direction: "asc" },
				{ field: "order", direction: "asc" },
			],
		},
	],
	preview: {
		select: {
			title: "title",
			category: "category",
			finding_key: "finding_key",
			order: "order",
		},
		prepare(selection: any) {
			const { title, category, finding_key, order } = selection;
			const subtitle = finding_key
				? `${category} — ${finding_key}`
				: `${category} (${order || 100})`;
			return { title, subtitle };
		},
	},
};

export default knowledgeArticle;
