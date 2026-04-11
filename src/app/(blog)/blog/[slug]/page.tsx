import { Metadata } from "next";
import { notFound } from "next/navigation";
import { integrations } from "../../../../../integrations.config";

export const revalidate = 3600;

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
	if (!integrations?.isSanityEnabled) return {};

	const { getPostBySlug } = await import("@/sanity/sanity-utils");
	const { slug } = await params;
	const post = await getPostBySlug(slug);

	if (!post?.title) return {};

	return {
		title: post.title,
		description: post.metadata ?? `Read "${post.title}" on the Vestigio blog.`,
		openGraph: {
			type: "article",
			title: post.title,
			description: post.metadata ?? `Read "${post.title}" on the Vestigio blog.`,
		},
		twitter: {
			card: "summary_large_image",
			title: post.title,
			description: post.metadata ?? `Read "${post.title}" on the Vestigio blog.`,
		},
	};
}

export default async function SingleBlog(props: Props) {
	if (!integrations?.isSanityEnabled) return notFound();

	const { getPostBySlug, imageBuilder } = await import("@/sanity/sanity-utils");
	const RenderBodyContent = (await import("@/components/Blog/RenderBodyContent")).default;
	const SocialShare = (await import("@/components/Blog/SocialShare")).default;
	const Image = (await import("next/image")).default;
	const Link = (await import("next/link")).default;

	const params = await props.params;
	const { slug } = params;
	const post = await getPostBySlug(slug);

	if (!post?.title) return notFound();

	const postURL = `${process.env.SITE_URL}/blog/${post?.slug?.current}`;

	return (
		<main>
			<section className="relative z-1 overflow-hidden pb-17.5 pt-35">
				<div className="mx-auto w-full max-w-[770px] px-4 sm:px-8 xl:px-0">
					<h1 className="mb-8 text-3xl font-bold text-black dark:text-white">
						{post.title}
					</h1>
					<div className="blog-details">
						<RenderBodyContent post={post as any} />
					</div>
				</div>
			</section>
		</main>
	);
}
