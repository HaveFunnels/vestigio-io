import BlogItem from "@/components/Blog/BlogItem";
import Breadcrumbs from "@/components/Common/Breadcrumbs";
import { getPosts } from "@/sanity/sanity-utils";
import { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import Image from "next/image";
import { integrations, messages } from "../../../../integrations.config";

export const metadata: Metadata = {
	title: `Blog - ${process.env.SITE_NAME}`,
	description: `This is Blog page for ${process.env.SITE_NAME}`,
};

const BlogGrid = async () => {
	const posts = integrations?.isSanityEnabled ? await getPosts() : [];
	const t = await getTranslations("common");

	return (
		<main>
			<section className='lg:ub-pb-22.5 relative z-1 overflow-hidden pb-17.5 pt-35 xl:pb-27.5'>
				{/* <!-- bg shapes --> */}
				<div>
					<div className='absolute left-0 top-0 -z-1'>
						<Image
							src='/images/blog/blog-shape-01.svg'
							alt='shape'
							width={340}
							height={680}
						/>
					</div>
					<div className='absolute right-0 top-0 -z-1'>
						<Image
							src='/images/blog/blog-shape-02.svg'
							alt='shape'
							width={425}
							height={682}
						/>
					</div>
				</div>

				<Breadcrumbs title={t("blog")} pages={[t("home"), t("blog_grids")]} />

				<div className='mx-auto w-full max-w-[1170px] px-4 sm:px-8 xl:px-0'>
					<div
						className={
							integrations?.isSanityEnabled
								? "grid grid-cols-1 gap-x-7.5 gap-y-10 sm:grid-cols-2 lg:grid-cols-3"
								: ""
						}
					>
						{/* Blog Item */}
						{posts?.length > 0 ? (
							posts?.map((item, key) => <BlogItem key={key} blog={item} />)
						) : integrations.isSanityEnabled ? (
							<p>{t("no_posts")}</p>
						) : (
							<>{messages.sanity}</>
						)}
					</div>
				</div>
			</section>
		</main>
	);
};

export default BlogGrid;
