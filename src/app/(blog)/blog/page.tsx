import Breadcrumbs from "@/components/Common/Breadcrumbs";
import { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import Image from "next/image";
import { integrations, messages } from "../../../../integrations.config";

export const revalidate = 3600;

export const metadata: Metadata = {
	title: "Blog — Vestigio",
	description: "Insights, tutorials, and best practices for SaaS platform optimization, automated audits, and data-driven decision making.",
	openGraph: {
		type: "website",
		title: "Blog — Vestigio",
		description: "Insights, tutorials, and best practices for SaaS platform optimization, automated audits, and data-driven decision making.",
	},
	twitter: {
		card: "summary_large_image",
		title: "Blog — Vestigio",
		description: "Insights, tutorials, and best practices for SaaS platform optimization, automated audits, and data-driven decision making.",
	},
};

const BlogGrid = async () => {
	const t = await getTranslations("common");

	if (!integrations?.isSanityEnabled) {
		return (
			<main>
				<section className='relative z-1 overflow-hidden pb-17.5 pt-35'>
					<Breadcrumbs title={t("blog")} pages={[t("home"), t("blog_grids")]} />
					<div className='mx-auto w-full max-w-[1170px] px-4 sm:px-8 xl:px-0'>
						<>{messages.sanity}</>
					</div>
				</section>
			</main>
		);
	}

	const { getPosts } = await import("@/sanity/sanity-utils");
	const BlogItem = (await import("@/components/Blog/BlogItem")).default;
	const posts = await getPosts();

	return (
		<main>
			<section className='lg:ub-pb-22.5 relative z-1 overflow-hidden pb-17.5 pt-35 xl:pb-27.5'>
				<div>
					<div className='absolute left-0 top-0 -z-1'>
						<Image src='/images/blog/blog-shape-01.svg' alt='shape' width={340} height={680} />
					</div>
					<div className='absolute right-0 top-0 -z-1'>
						<Image src='/images/blog/blog-shape-02.svg' alt='shape' width={425} height={682} />
					</div>
				</div>

				<Breadcrumbs title={t("blog")} pages={[t("home"), t("blog_grids")]} />

				<div className='mx-auto w-full max-w-[1170px] px-4 sm:px-8 xl:px-0'>
					<div className='grid grid-cols-1 gap-x-7.5 gap-y-10 sm:grid-cols-2 lg:grid-cols-3'>
						{posts?.length > 0 ? (
							posts?.map((item, key) => <BlogItem key={key} blog={item} />)
						) : (
							<p>{t("no_posts")}</p>
						)}
					</div>
				</div>
			</section>
		</main>
	);
};

export default BlogGrid;
