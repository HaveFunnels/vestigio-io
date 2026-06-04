"use client";

import { ShieldCheck as ShieldIcon } from "@phosphor-icons/react/dist/ssr";
import { useTranslations } from "next-intl";

export default function TrustMicrocopy() {
	const t = useTranslations("homepage.hero_v2.trust_microcopy");

	return (
		<div className="mt-4 flex items-center justify-center sm:mt-5">
			<span className="flex items-center gap-1.5 text-[11px] text-zinc-500 sm:text-xs">
				<ShieldIcon
					size={13}
					weight="fill"
					className="shrink-0 text-emerald-500/70"
				/>
				<span>{t("guarantee")}</span>
			</span>
		</div>
	);
}
