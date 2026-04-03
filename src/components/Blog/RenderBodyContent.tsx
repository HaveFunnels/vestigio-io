import { Blog } from "@/types/blog";
import { PortableText } from "@portabletext/react";
import { getImageDimensions } from "@sanity/asset-utils";
import urlBuilder from "@sanity/image-url";
import Image from "next/image";

const config = {
	projectId: process.env.NEXT_PUBLIC_SANITY_PROJECT_ID || "",
	dataset: "production",
	apiVersion: "2023-03-09",
	useCdn: false,
};

// Barebones lazy-loaded image component
const SampleImageComponent = ({ value, isInline }: any) => {
	const { width, height } = getImageDimensions(value);
	return (
		<div className='my-10 overflow-hidden rounded-[15px]'>
			<Image
				src={
					urlBuilder(config)
						.image(value)
						.fit("max")
						.auto("format")
						.url() as string
				}
				width={width}
				height={height}
				alt={value.alt || "blog image"}
				loading='lazy'
				style={{
					// Display alongside text if image appears inside a block text span
					display: isInline ? "inline-block" : "block",

					// Avoid jumping around with aspect-ratio CSS property
					aspectRatio: width / height,
				}}
			/>
		</div>
	);
};

const components = {
	types: {
		image: SampleImageComponent,
	},
};

const RenderBodyContent = ({ post }: { post: Blog }) => {
	return (
		<>
			<PortableText value={post?.body as any} components={components} />
		</>
	);
};

export default RenderBodyContent;
