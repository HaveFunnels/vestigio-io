interface FaqItem {
	question: string;
	answer: string;
}

export default function FaqJsonLd({ faqs }: { faqs: FaqItem[] }) {
	const faqSchema = {
		"@context": "https://schema.org",
		"@type": "FAQPage",
		mainEntity: faqs.map(({ question, answer }) => ({
			"@type": "Question",
			name: question,
			acceptedAnswer: {
				"@type": "Answer",
				text: answer,
			},
		})),
	};

	return (
		<script
			type="application/ld+json"
			dangerouslySetInnerHTML={{
				__html: JSON.stringify(faqSchema),
			}}
		/>
	);
}
