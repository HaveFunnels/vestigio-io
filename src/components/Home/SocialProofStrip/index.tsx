import { getTranslations } from "next-intl/server";

const SocialProofStrip = async () => {
	const t = await getTranslations("homepage.social_proof_strip");

	return (
		<div className="relative z-1 pt-3 pb-0 sm:pt-4 sm:pb-0">
			<p className="text-center text-[13px] leading-relaxed text-zinc-500 sm:text-sm">
				{t("before_highlight")}
				<span className="inline-flex items-baseline gap-1 rounded-full border border-red-500/20 bg-red-500/[0.06] px-2 py-0.5 font-mono text-[13px] font-semibold text-red-400 sm:text-sm">
					{t("highlight")}
				</span>
				{t("after_highlight")}
			</p>
		</div>
	);
};

export default SocialProofStrip;
