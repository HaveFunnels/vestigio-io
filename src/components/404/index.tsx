"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";

const NotFound = () => {
	const t = useTranslations("404_page");

	return (
		<section className="flex min-h-screen items-center justify-center bg-surface-shell px-4">
			<div className="w-full max-w-md text-center">
				{/* Large 404 */}
				<div className="mb-6 select-none text-[120px] font-extrabold leading-none tracking-tighter text-content-faint/20 sm:text-[160px]">
					404
				</div>

				{/* Icon */}
				<div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-2xl border border-edge bg-surface-card">
					<svg className="h-7 w-7 text-content-faint" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
						<path strokeLinecap="round" strokeLinejoin="round" d="M15.182 16.318A4.486 4.486 0 0012.016 15a4.486 4.486 0 00-3.198 1.318M21 12a9 9 0 11-18 0 9 9 0 0118 0zM9.75 9.75c0 .414-.168.75-.375.75S9 10.164 9 9.75 9.168 9 9.375 9s.375.336.375.75zm-.375 0h.008v.015h-.008V9.75zm5.625 0c0 .414-.168.75-.375.75s-.375-.336-.375-.75.168-.75.375-.75.375.336.375.75zm-.375 0h.008v.015h-.008V9.75z" />
					</svg>
				</div>

				<h1 className="mb-3 text-2xl font-bold text-content sm:text-3xl">
					{t("title")}
				</h1>

				<p className="mx-auto mb-8 max-w-sm text-sm leading-relaxed text-content-muted">
					{t("description")}
				</p>

				<div className="flex flex-wrap items-center justify-center gap-3">
					<Link
						href="/"
						className="inline-flex items-center gap-2 rounded-lg border border-edge bg-surface-card px-5 py-2.5 text-sm font-medium text-content-secondary transition-colors hover:bg-surface-card-hover"
					>
						<svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
							<path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
						</svg>
						{t("cta.go_back")}
					</Link>

					<Link
						href="/"
						className="inline-flex rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent/90"
					>
						{t("cta.home")}
					</Link>
				</div>
			</div>
		</section>
	);
};

export default NotFound;
