import { Metadata } from "next";
import { getTranslations } from "next-intl/server";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getTranslations("refund_policy");
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
// 11 sections. Default shape = title + body (+ optional items).
// Sections 2, 4, 9, 10, 11 deviate and get hardcoded branches.
// Keys live in dictionary/*.json under "refund_policy".
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
] as const;

const DEFAULT_WITH_ITEMS = new Set(["s1", "s3", "s7", "s8"]);

const RefundPolicyPage = async () => {
	const t = await getTranslations("refund_policy");
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

				<p className='leading-relaxed text-zinc-400'>{t("intro")}</p>

				<div className='mt-10 space-y-10'>
					{SECTION_IDS.map((id) => {
						// Section 2 — body1 + items + body2 + body3
						if (id === "s2") {
							return (
								<section key={id}>
									<h2 className='mb-4 text-lg font-semibold text-white'>
										{t("s2_title")}
									</h2>
									<p className='mb-3 leading-relaxed text-zinc-400'>
										{t("s2_body_1")}
									</p>
									{renderItems("s2_items")}
									<p className='mt-5 leading-relaxed text-zinc-400'>
										{t("s2_body_2")}
									</p>
									<p className='mt-3 leading-relaxed text-zinc-400'>
										{t("s2_body_3")}
									</p>
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

						// Section 9 — 2 bodies, no items
						if (id === "s9") {
							return (
								<section key={id}>
									<h2 className='mb-4 text-lg font-semibold text-white'>
										{t("s9_title")}
									</h2>
									<p className='mb-4 leading-relaxed text-zinc-400'>
										{t("s9_body_1")}
									</p>
									<p className='leading-relaxed text-zinc-400'>
										{t("s9_body_2")}
									</p>
								</section>
							);
						}

						// Section 10 — 2 bodies, no items
						if (id === "s10") {
							return (
								<section key={id}>
									<h2 className='mb-4 text-lg font-semibold text-white'>
										{t("s10_title")}
									</h2>
									<p className='mb-4 leading-relaxed text-zinc-400'>
										{t("s10_body_1")}
									</p>
									<p className='leading-relaxed text-zinc-400'>
										{t("s10_body_2")}
									</p>
								</section>
							);
						}

						// Section 11 — contact card
						if (id === "s11") {
							return (
								<section key={id}>
									<h2 className='mb-4 text-lg font-semibold text-white'>
										{t("s11_title")}
									</h2>
									<p className='mb-4 leading-relaxed text-zinc-400'>
										{t("s11_body")}
									</p>
									<p className='leading-relaxed'>
										<a
											href='mailto:support@vestigio.io'
											className='text-emerald-400 hover:text-emerald-300'
										>
											{t("s11_email")}
										</a>
									</p>
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

export default RefundPolicyPage;
