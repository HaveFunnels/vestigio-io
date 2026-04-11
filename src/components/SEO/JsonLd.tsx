export default function JsonLd() {
	const organizationSchema = {
		"@context": "https://schema.org",
		"@type": "Organization",
		name: "Vestigio",
		url: "https://vestigio.io",
		logo: "https://vestigio.io/images/logo/logo.png",
	};

	const webSiteSchema = {
		"@context": "https://schema.org",
		"@type": "WebSite",
		name: "Vestigio",
		url: "https://vestigio.io",
		potentialAction: {
			"@type": "SearchAction",
			target: "https://vestigio.io/blog?q={search_term_string}",
			"query-input": "required name=search_term_string",
		},
	};

	const softwareApplicationSchema = {
		"@context": "https://schema.org",
		"@type": "SoftwareApplication",
		name: "Vestigio",
		applicationCategory: "BusinessApplication",
		operatingSystem: "Web",
		offers: [
			{
				"@type": "Offer",
				name: "Vestigio",
				price: "0",
				priceCurrency: "USD",
			},
			{
				"@type": "Offer",
				name: "Pro",
				price: "49",
				priceCurrency: "USD",
			},
			{
				"@type": "Offer",
				name: "Max",
				price: "99",
				priceCurrency: "USD",
			},
		],
	};

	return (
		<>
			<script
				type="application/ld+json"
				dangerouslySetInnerHTML={{
					__html: JSON.stringify(organizationSchema),
				}}
			/>
			<script
				type="application/ld+json"
				dangerouslySetInnerHTML={{
					__html: JSON.stringify(webSiteSchema),
				}}
			/>
			<script
				type="application/ld+json"
				dangerouslySetInnerHTML={{
					__html: JSON.stringify(softwareApplicationSchema),
				}}
			/>
		</>
	);
}
