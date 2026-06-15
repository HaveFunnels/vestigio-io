import { getTranslations } from "next-intl/server";
import RotatingStat from "./RotatingStat";

const SocialProofStrip = async () => {
	const t = await getTranslations("homepage.social_proof_strip");
	const rotating = t.raw("rotating_highlights") as string[] | undefined;
	const fallback = t("highlight");
	const items = Array.isArray(rotating) && rotating.length > 0 ? rotating : [fallback];

	return (
		<div className="relative z-1 pt-3 pb-0 sm:pt-4 sm:pb-0">
			<p className="text-center text-[13px] leading-relaxed text-zinc-500 sm:text-sm">
				{t("before_highlight")}
				<RotatingStat
					items={items}
					className="mx-1 inline-block rounded-full border border-red-500/20 bg-red-500/[0.06] px-1.5 font-semibold text-red-400"
				/>
				{t("after_highlight")}
			</p>
		</div>
	);
};

export default SocialProofStrip;
