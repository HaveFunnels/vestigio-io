import { getTranslations } from "next-intl/server";
import RotatingStat from "./RotatingStat";

const SocialProofStrip = async () => {
	const t = await getTranslations("homepage.social_proof_strip");
	const rotating = t.raw("rotating_highlights") as string[] | undefined;
	const fallback = t("highlight");
	const items = Array.isArray(rotating) && rotating.length > 0 ? rotating : [fallback];

	/* Layout (per /frontend-design verdict 2026-06-22):
	   Mobile renders 3 stable lines — prose / stat / prose. Forcing the
	   stat onto its own block-level line locks the strip's height
	   regardless of which value is rotating in (range: 19–37 chars). At
	   the original inline-block + bold + pill treatment, longer stats
	   pushed the surrounding sentence from 2 lines to 3, producing
	   layout shift on every rotation cycle (every 4.5s). Centered prose
	   above + centered prose below also frames the slot-text animation
	   as the visual moment of the strip.

	   Mobile structure:
	     Empresas do seu tamanho têm    (line 1, zinc-500, prose)
	          12s extras no checkout    (line 2, red-400, prose-weight)
	         por mês. Ninguém vê.       (line 3, zinc-500, prose)

	   Stat treatment: color-only signal (text-red-400). Dropped the pill
	   (border + bg + px), dropped font-semibold. Same font-weight as the
	   surrounding sentence so the eye reads it as part of the prose, not
	   as a foreign object — peripheral surface, color does the work.
	   Desktop (sm+) reverts to the original inline flow via sm:inline. */
	return (
		<div className="relative z-1 pt-3 pb-0 sm:pt-4 sm:pb-0">
			<p className="text-center text-[13px] leading-relaxed text-zinc-500 sm:text-sm">
				{t("before_highlight")}
				<RotatingStat
					items={items}
					className="block text-red-400 sm:mx-1 sm:inline"
				/>
				{t("after_highlight")}
			</p>
		</div>
	);
};

export default SocialProofStrip;
