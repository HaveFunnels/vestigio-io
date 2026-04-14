import { Metadata } from "next";
import { getTranslations } from "next-intl/server";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getTranslations("privacy_policy");
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
// Section rendering
//
// Default shape = title + single body paragraph, optionally followed by
// a bullet list. Sections 2, 3, 7, 8, 10, 11, 13, 16 deviate and get
// hardcoded branches in the render loop below. Keys are colocated with
// translations in dictionary/*.json under the "privacy_policy" namespace.
// ──────────────────────────────────────────────

// Order matters — same as the legal text.
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
] as const;

// Default-shape sections that render a bullet list after the body.
const DEFAULT_WITH_ITEMS = new Set(["s1", "s4", "s5", "s12"]);

const PrivacyPage = async () => {
	const t = await getTranslations("privacy_policy");
	// `has` is safe to call for optional keys — next-intl returns false
	// for missing keys instead of throwing.
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
						// Section 2 — subsections with unique shape
						if (id === "s2") {
							const subIds = ["s2_1", "s2_2", "s2_3", "s2_4", "s2_5"];
							return (
								<section key={id}>
									<h2 className='mb-4 text-lg font-semibold text-white'>
										{t("s2_title")}
									</h2>
									<p className='mb-6 leading-relaxed text-zinc-400'>
										{t("s2_body")}
									</p>
									<div className='space-y-6'>
										{subIds.map((subId) => (
											<div key={subId}>
												<h3 className='mb-2 text-base font-medium text-zinc-100'>
													{t(`${subId}_title`)}
												</h3>
												<p className='mb-3 leading-relaxed text-zinc-400'>
													{t(`${subId}_body`)}
												</p>
												{subId === "s2_5" && (
													<>
														<p className='mb-2 leading-relaxed text-zinc-400'>
															{t("s2_5_items_intro")}
														</p>
														{renderItems("s2_5_items")}
													</>
												)}
											</div>
										))}
									</div>
								</section>
							);
						}

						// Section 3 — intro + items + body2 + body3
						if (id === "s3") {
							return (
								<section key={id}>
									<h2 className='mb-4 text-lg font-semibold text-white'>
										{t("s3_title")}
									</h2>
									<p className='mb-3 leading-relaxed text-zinc-400'>
										{t("s3_body_1")}
									</p>
									{renderItems("s3_items")}
									<p className='mt-5 leading-relaxed text-zinc-400'>
										{t("s3_body_2")}
									</p>
									<p className='mt-3 leading-relaxed text-zinc-400'>
										{t("s3_body_3")}
									</p>
								</section>
							);
						}

						// Section 7 — items1 (purposes) + body2 + items2 (tools) + body3
						if (id === "s7") {
							return (
								<section key={id}>
									<h2 className='mb-4 text-lg font-semibold text-white'>
										{t("s7_title")}
									</h2>
									<p className='mb-3 leading-relaxed text-zinc-400'>
										{t("s7_body_1")}
									</p>
									{renderItems("s7_items_1")}
									<p className='mt-5 mb-3 leading-relaxed text-zinc-400'>
										{t("s7_body_2")}
									</p>
									{renderItems("s7_items_2")}
									<p className='mt-5 leading-relaxed text-zinc-400'>
										{t("s7_body_3")}
									</p>
								</section>
							);
						}

						// Sections 8 + 10 share shape: 2 bodies + items
						if (id === "s8" || id === "s10") {
							return (
								<section key={id}>
									<h2 className='mb-4 text-lg font-semibold text-white'>
										{t(`${id}_title`)}
									</h2>
									<p className='mb-4 leading-relaxed text-zinc-400'>
										{t(`${id}_body_1`)}
									</p>
									<p className='mb-3 leading-relaxed text-zinc-400'>
										{t(`${id}_body_2`)}
									</p>
									{renderItems(`${id}_items`)}
								</section>
							);
						}

						// Section 11 — 3 paragraphs, no items
						if (id === "s11") {
							return (
								<section key={id}>
									<h2 className='mb-4 text-lg font-semibold text-white'>
										{t("s11_title")}
									</h2>
									<p className='mb-4 leading-relaxed text-zinc-400'>
										{t("s11_body_1")}
									</p>
									<p className='mb-4 leading-relaxed text-zinc-400'>
										{t("s11_body_2")}
									</p>
									<p className='leading-relaxed text-zinc-400'>
										{t("s11_body_3")}
									</p>
								</section>
							);
						}

						// Section 13 — body1 (with email) + items + body2
						if (id === "s13") {
							return (
								<section key={id}>
									<h2 className='mb-4 text-lg font-semibold text-white'>
										{t("s13_title")}
									</h2>
									<p className='mb-3 leading-relaxed text-zinc-400'>
										{t("s13_body_1")}
									</p>
									{renderItems("s13_items")}
									<p className='mt-5 leading-relaxed text-zinc-400'>
										{t("s13_body_2")}
									</p>
								</section>
							);
						}

						// Section 16 — rendered as contact card
						if (id === "s16") {
							return (
								<section key={id}>
									<h2 className='mb-4 text-lg font-semibold text-white'>
										{t("s16_title")}
									</h2>
									<p className='mb-4 leading-relaxed text-zinc-400'>
										{t("s16_body")}
									</p>
									<div className='rounded-xl border border-zinc-800 bg-zinc-900/50 px-6 py-5'>
										<p className='font-medium text-zinc-100'>
											{t("s16_company")}
										</p>
										<p className='mt-1 text-sm text-zinc-400'>{t("s16_cnpj")}</p>
										<p className='mt-1 text-sm text-zinc-400'>
											{t("s16_address")}
										</p>
										<p className='mt-1 text-sm text-zinc-400'>
											<a
												href='mailto:support@vestigio.io'
												className='text-emerald-400 hover:text-emerald-300'
											>
												{t("s16_email")}
											</a>
										</p>
									</div>
								</section>
							);
						}

						// Default shape: title + body (+ optional items).
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

export default PrivacyPage;
