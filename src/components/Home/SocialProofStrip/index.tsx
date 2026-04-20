import { getTranslations } from "next-intl/server";

// ──────────────────────────────────────────────
// SocialProofStrip — single devastating line of
// social proof between Hero and Product Tour.
//
// Design: understated footnote that happens to be
// devastating. No card, no border, no icon. Just
// a line of centered text with the financial
// impact highlighted.
// ──────────────────────────────────────────────

const SocialProofStrip = async () => {
	const t = await getTranslations("homepage.social_proof_strip");

	return (
		<div className="relative z-1 py-6 sm:py-8">
			<p className="text-center text-[13px] leading-relaxed text-zinc-500 sm:text-sm">
				{t("before_highlight")}
				<span className="font-mono font-semibold text-red-400">
					{t("highlight")}
				</span>
				{t("after_highlight")}
			</p>
		</div>
	);
};

export default SocialProofStrip;
