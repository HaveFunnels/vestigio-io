import { Metadata } from "next";
import { getTranslations } from "next-intl/server";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getTranslations("terms_of_use");
	return {
		title: t("meta_title"),
		description: t("meta_description"),
		openGraph: {
			title: t("meta_title"),
			description: t("meta_description"),
		},
	};
}

// ──────────────────────────────────────────────
// Section shapes
//
// Default = title + body (+ optional items).
// Sections that deviate get a hardcoded branch.
// Keys live under the "terms_of_use" namespace in dictionary/*.json.
// ──────────────────────────────────────────────

const SECTION_IDS = [
	"s1",
	"s2",
	"s3",
	"s4",
	"s5",
	"s6",
	"s7",
	"s8",
	"s9",
	"s10",
	"s11",
	"s12",
	"s13",
	"s14",
	"s15",
	"s16",
	"s17",
	"s18",
	"s19",
] as const;

const DEFAULT_WITH_ITEMS = new Set(["s8", "s9", "s11"]);

const TermsPage = async () => {
	const t = await getTranslations("terms_of_use");
	const hasDisclaimer = (() => {
		try {
			return Boolean(t("translation_disclaimer"));
		} catch {
			return false;
		}
	})();

	const renderItems = (key: string) => {
		const items = t.raw(key) as string[];
		if (!Array.isArray(items)) return null;
		return (
			<ul className='ml-5 list-disc space-y-2 leading-relaxed text-zinc-400'>
				{items.map((item, i) => (
					<li key={i}>{item}</li>
				))}
			</ul>
		);
	};

	// Section 1 — definitions rendered as term: description pairs.
	const renderDefinitions = () => {
		const defs = t.raw("s1_definitions") as Array<{
			term: string;
			body: string;
		}>;
		if (!Array.isArray(defs)) return null;
		return (
			<dl className='space-y-3'>
				{defs.map((def, i) => (
					<div key={i} className='leading-relaxed text-zinc-400'>
						<dt className='inline font-medium text-zinc-100'>{def.term}: </dt>
						<dd className='inline'>{def.body}</dd>
					</div>
				))}
			</dl>
		);
	};

	return (
		<main className='min-h-screen bg-[#090911]'>
			<div className='mx-auto max-w-3xl px-4 py-20 sm:px-8 sm:py-28'>
				<h1 className='mb-3 text-3xl font-bold tracking-tight text-white sm:text-4xl'>
					{t("heading")}
				</h1>
				<p className='mb-6 text-sm text-zinc-500'>{t("last_updated")}</p>

				{hasDisclaimer && (
					<p className='mb-8 rounded-md border border-zinc-800 bg-zinc-900/40 px-4 py-3 text-sm text-zinc-400'>
						{t("translation_disclaimer")}
					</p>
				)}

				<div className='space-y-5 text-zinc-400'>
					<p className='leading-relaxed'>{t("intro_1")}</p>
					<p className='leading-relaxed'>{t("intro_2")}</p>
				</div>

				<div className='mt-10 space-y-10'>
					{SECTION_IDS.map((id) => {
						// Section 1 — definitions (term/description pairs)
						if (id === "s1") {
							return (
								<section key={id}>
									<h2 className='mb-4 text-lg font-semibold text-white'>
										{t("s1_title")}
									</h2>
									<p className='mb-4 leading-relaxed text-zinc-400'>
										{t("s1_body")}
									</p>
									{renderDefinitions()}
								</section>
							);
						}

						// Section 2 — body1 + body2 + items + body3
						if (id === "s2") {
							return (
								<section key={id}>
									<h2 className='mb-4 text-lg font-semibold text-white'>
										{t("s2_title")}
									</h2>
									<p className='mb-4 leading-relaxed text-zinc-400'>
										{t("s2_body_1")}
									</p>
									<p className='mb-3 leading-relaxed text-zinc-400'>
										{t("s2_body_2")}
									</p>
									{renderItems("s2_items")}
									<p className='mt-5 leading-relaxed text-zinc-400'>
										{t("s2_body_3")}
									</p>
								</section>
							);
						}

						// Section 3 — body1 + body2 + items_1 + body3 + items_2
						if (id === "s3") {
							return (
								<section key={id}>
									<h2 className='mb-4 text-lg font-semibold text-white'>
										{t("s3_title")}
									</h2>
									<p className='mb-4 leading-relaxed text-zinc-400'>
										{t("s3_body_1")}
									</p>
									<p className='mb-3 leading-relaxed text-zinc-400'>
										{t("s3_body_2")}
									</p>
									{renderItems("s3_items_1")}
									<p className='mt-5 mb-3 leading-relaxed text-zinc-400'>
										{t("s3_body_3")}
									</p>
									{renderItems("s3_items_2")}
								</section>
							);
						}

						// Section 4 — body1 + items + body2
						if (id === "s4") {
							return (
								<section key={id}>
									<h2 className='mb-4 text-lg font-semibold text-white'>
										{t("s4_title")}
									</h2>
									<p className='mb-3 leading-relaxed text-zinc-400'>
										{t("s4_body_1")}
									</p>
									{renderItems("s4_items")}
									<p className='mt-5 leading-relaxed text-zinc-400'>
										{t("s4_body_2")}
									</p>
								</section>
							);
						}

						// Section 5 — body1 + items + body2 + body3 + body4
						if (id === "s5") {
							return (
								<section key={id}>
									<h2 className='mb-4 text-lg font-semibold text-white'>
										{t("s5_title")}
									</h2>
									<p className='mb-3 leading-relaxed text-zinc-400'>
										{t("s5_body_1")}
									</p>
									{renderItems("s5_items")}
									<p className='mt-5 leading-relaxed text-zinc-400'>
										{t("s5_body_2")}
									</p>
									<p className='mt-3 leading-relaxed text-zinc-400'>
										{t("s5_body_3")}
									</p>
									<p className='mt-3 leading-relaxed text-zinc-400'>
										{t("s5_body_4")}
									</p>
								</section>
							);
						}

						// Section 6 — 4 bodies, no items
						if (id === "s6") {
							return (
								<section key={id}>
									<h2 className='mb-4 text-lg font-semibold text-white'>
										{t("s6_title")}
									</h2>
									<p className='mb-4 leading-relaxed text-zinc-400'>
										{t("s6_body_1")}
									</p>
									<p className='mb-4 leading-relaxed text-zinc-400'>
										{t("s6_body_2")}
									</p>
									<p className='mb-4 leading-relaxed text-zinc-400'>
										{t("s6_body_3")}
									</p>
									<p className='leading-relaxed text-zinc-400'>
										{t("s6_body_4")}
									</p>
								</section>
							);
						}

						// Section 7 — 3 bodies, no items
						if (id === "s7") {
							return (
								<section key={id}>
									<h2 className='mb-4 text-lg font-semibold text-white'>
										{t("s7_title")}
									</h2>
									<p className='mb-4 leading-relaxed text-zinc-400'>
										{t("s7_body_1")}
									</p>
									<p className='mb-4 leading-relaxed text-zinc-400'>
										{t("s7_body_2")}
									</p>
									<p className='leading-relaxed text-zinc-400'>
										{t("s7_body_3")}
									</p>
								</section>
							);
						}

						// Section 10 — body1 + body2 + items
						if (id === "s10") {
							return (
								<section key={id}>
									<h2 className='mb-4 text-lg font-semibold text-white'>
										{t("s10_title")}
									</h2>
									<p className='mb-4 leading-relaxed text-zinc-400'>
										{t("s10_body_1")}
									</p>
									<p className='mb-3 leading-relaxed text-zinc-400'>
										{t("s10_body_2")}
									</p>
									{renderItems("s10_items")}
								</section>
							);
						}

						// Section 12 — 2 bodies, no items
						if (id === "s12") {
							return (
								<section key={id}>
									<h2 className='mb-4 text-lg font-semibold text-white'>
										{t("s12_title")}
									</h2>
									<p className='mb-4 leading-relaxed text-zinc-400'>
										{t("s12_body_1")}
									</p>
									<p className='leading-relaxed text-zinc-400'>
										{t("s12_body_2")}
									</p>
								</section>
							);
						}

						// Sections 14, 15, 16 — body + items
						if (id === "s14" || id === "s15" || id === "s16") {
							return (
								<section key={id}>
									<h2 className='mb-4 text-lg font-semibold text-white'>
										{t(`${id}_title`)}
									</h2>
									<p className='mb-3 leading-relaxed text-zinc-400'>
										{t(`${id}_body`)}
									</p>
									{renderItems(`${id}_items`)}
								</section>
							);
						}

						// Section 17 — 2 bodies
						if (id === "s17") {
							return (
								<section key={id}>
									<h2 className='mb-4 text-lg font-semibold text-white'>
										{t("s17_title")}
									</h2>
									<p className='mb-4 leading-relaxed text-zinc-400'>
										{t("s17_body_1")}
									</p>
									<p className='leading-relaxed text-zinc-400'>
										{t("s17_body_2")}
									</p>
								</section>
							);
						}

						// Section 18 — 2 bodies
						if (id === "s18") {
							return (
								<section key={id}>
									<h2 className='mb-4 text-lg font-semibold text-white'>
										{t("s18_title")}
									</h2>
									<p className='mb-4 leading-relaxed text-zinc-400'>
										{t("s18_body_1")}
									</p>
									<p className='leading-relaxed text-zinc-400'>
										{t("s18_body_2")}
									</p>
								</section>
							);
						}

						// Section 19 — contact card
						if (id === "s19") {
							return (
								<section key={id}>
									<h2 className='mb-4 text-lg font-semibold text-white'>
										{t("s19_title")}
									</h2>
									<div className='rounded-xl border border-zinc-800 bg-zinc-900/50 px-6 py-5'>
										<p className='font-medium text-zinc-100'>
											{t("s19_company")}
										</p>
										<p className='mt-1 text-sm text-zinc-400'>{t("s19_cnpj")}</p>
										<p className='mt-1 text-sm text-zinc-400'>
											{t("s19_address")}
										</p>
										<p className='mt-1 text-sm text-zinc-400'>
											<a
												href='mailto:support@vestigio.io'
												className='text-emerald-400 hover:text-emerald-300'
											>
												{t("s19_email")}
											</a>
										</p>
									</div>
								</section>
							);
						}

						// Default: title + body (+ optional items)
						return (
							<section key={id}>
								<h2 className='mb-4 text-lg font-semibold text-white'>
									{t(`${id}_title`)}
								</h2>
								<p className='mb-3 leading-relaxed text-zinc-400'>
									{t(`${id}_body`)}
								</p>
								{DEFAULT_WITH_ITEMS.has(id) && renderItems(`${id}_items`)}
							</section>
						);
					})}
				</div>
			</div>
		</main>
	);
};

export default TermsPage;
