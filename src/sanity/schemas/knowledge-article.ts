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
					{ title: "Concept", value: "concept" },
					{ title: "Pack", value: "pack" },
					{ title: "Finding", value: "finding" },
					{ title: "Guide", value: "guide" },
				],
			},
			validation: (Rule: any) => Rule.required(),
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
			name: "publishedAt",
			title: "Published At",
			type: "datetime",
		},
	],
	preview: {
		select: {
			title: "title",
			category: "category",
			finding_key: "finding_key",
		},
		prepare(selection: any) {
			const { title, category, finding_key } = selection;
			const subtitle = finding_key
				? `${category} — ${finding_key}`
				: category;
			return { title, subtitle };
		},
	},
};

export default knowledgeArticle;
