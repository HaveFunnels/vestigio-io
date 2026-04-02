const integrations = {
	isSanityEnabled: !!process.env.NEXT_PUBLIC_SANITY_PROJECT_ID,
	isOpenAIEnabled: true,
	isAlgoliaEnabled: true,
	isMailchimpEnabled: true,
	isAuthEnabled: true,
	isPaymentsEnabled: true,
	isI18nEnabled: true,
};

const messages = {
	sanity: (
		<div style={{ whiteSpace: "pre-wrap" }}>
			Sanity is not enabled. Follow the{" "}
			<a
				href='#'
				className='text-primary underline'
				target='_blank'
				rel='noopener noreferrer'
			>
				documentation
			</a>{" "}
			to enable it.
		</div>
	),
	payment: (
		<div style={{ whiteSpace: "pre-wrap" }}>
			Payment is not enabled. Follow the{" "}
			<a
				href='#'
				className='text-primary underline'
				target='_blank'
				rel='noopener noreferrer'
			>
				documentation
			</a>{" "}
			to enable it.
		</div>
	),
	openai: (
		<div style={{ whiteSpace: "pre-wrap" }}>
			OpenAI is not enabled. Follow the{" "}
			<a
				href='#'
				className='text-primary underline'
			>
				documentation
			</a>{" "}
			to enable it.
		</div>
	),
	algolia: (
		<div style={{ whiteSpace: "pre-wrap" }}>
			Algolia is not enabled. Follow the{" "}
			<a
				href='#'
				className='text-primary underline'
			>
				documentation
			</a>{" "}
			to enable it.
		</div>
	),
	mailchimp: (
		<div style={{ whiteSpace: "pre-wrap" }}>
			Mailchimp is not enabled. Follow the {""}
			<a
				href='#'
				className='text-primary underline'
			>
				documentation
			</a>{" "}
			to enable it.
		</div>
	),
	auth: (
		<div style={{ whiteSpace: "pre-wrap" }}>
			Auth is not enabled. Follow the{" "}
			<a
				href='#'
				className='text-primary underline'
			>
				documentation
			</a>{" "}
			to enable it.
		</div>
	),
	s3: (
		<div style={{ whiteSpace: "pre-wrap" }}>
			S3 is not enabled. Follow the{" "}
			<a
				href='#'
				className='text-primary underline'
				target='_blank'
				rel='noopener noreferrer'
			>
				documentation
			</a>{" "}
			to enable it.
		</div>
	),
};

export { integrations, messages };

