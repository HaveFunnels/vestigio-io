import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ShinyButton } from "@/components/ui/shiny-button";

interface CallToActionProps {
	primaryCtaHref?: string;
}

const CallToAction = async ({
	primaryCtaHref = "/auth/signup",
}: CallToActionProps = {}) => {
	const t = await getTranslations("homepage.cta");

	return (
		<section className='relative z-1 overflow-hidden bg-[#090911] py-8 sm:py-10 lg:py-14'>
			<div className='mx-auto w-full max-w-[700px] px-4 text-center sm:px-8 xl:px-0'>
				{/* Gradient glow */}
				<div className='absolute left-1/2 top-1/2 h-[220px] w-[340px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-emerald-900/20 blur-[80px] sm:h-[300px] sm:w-[500px] sm:blur-[100px]' />

				<div className='relative'>
					<h2 className='mb-4 text-[1.75rem] font-bold leading-[1.15] tracking-tight text-white sm:mb-5 sm:text-3xl lg:text-4xl xl:text-5xl'>
						{t("title")}
					</h2>

					<p className='mb-7 text-sm text-zinc-400 sm:mb-8 sm:text-base'>
						{t("subtitle")}
					</p>

					<Link href={primaryCtaHref} className="block sm:inline-block">
						<ShinyButton>{t("primary")}</ShinyButton>
					</Link>

					<p className='mt-4 text-xs text-zinc-500'>
						{t("micro")}
					</p>
				</div>
			</div>
		</section>
	);
};

export default CallToAction;
