import { notFound } from "next/navigation";
import { integrations } from "../../../../../../integrations.config";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

export default async function AuthorPage(props: Props) {
	if (!integrations?.isSanityEnabled) return notFound();

	const { getPostsByAuthor, getAuthorBySlug, imageBuilder } = await import("@/sanity/sanity-utils");
	const BlogItem = (await import("@/components/Blog/BlogItem")).default;
	const Image = (await import("next/image")).default;

	const params = await props.params;
	const { slug } = params;
	const posts = await getPostsByAuthor(slug);
	const author = (await getAuthorBySlug(slug)) as any;

	if (!author) return notFound();

	return (
		<main>
			<section className="relative z-1 overflow-hidden pb-17.5 pt-35">
				<div className="mx-auto w-full max-w-[1170px] px-4 sm:px-8 xl:px-0">
					<h1 className="mb-8 text-2xl font-bold">{author?.name}</h1>
					<div className="grid grid-cols-1 gap-7.5 sm:grid-cols-2 lg:grid-cols-3">
						{posts?.map((item: any, key: number) => <BlogItem key={key} blog={item} />)}
						{!posts?.length && <p>No posts available.</p>}
					</div>
				</div>
			</section>
		</main>
	);
}
