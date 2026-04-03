// Avoid importing from "sanity" package at module level — it triggers createClient
// PortableTextBlock is just an array of blocks with _type and children
type PortableTextBlock = {
	_type: string;
	_key?: string;
	children?: any[];
	[key: string]: any;
};

export type Author = {
	name: string;
	image: string;
	bio?: string;
	slug: {
		current: string;
	};
	_id?: number | string;
	_ref?: number | string;
};

export type Blog = {
	_id: number;
	title: string;
	slug: any;
	metadata: string;
	body: PortableTextBlock[];
	mainImage: any;
	author: Author;
	tags: string[];
	publishedAt: string;
};
