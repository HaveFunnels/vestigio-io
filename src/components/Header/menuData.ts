import { Menu } from "@/types/menu";

/**
 * Menu data structure
 * 
 * Each item uses titleKey which corresponds to translation keys in locale files.
 * For example, titleKey: 'features' will use the translation from 'header.features'.
 * 
 * This allows the menu structure to remain consistent while supporting multiple languages.
 * Actual text content should be stored in locale files (en.json, fr.json, etc.).
 */

export const menuData: Menu[] = [
	{
		id: 1,
		titleKey: "features",
		newTab: false,
		path: "#features",
	},
	{
		id: 2,
		titleKey: "pricing",
		newTab: false,
		path: "#pricing",
	},
	{
		id: 2,
		titleKey: "blog",
		newTab: false,
		path: "/blog",
	},

	{
		id: 2,
		titleKey: "pages",
		newTab: false,
		submenu: [
			{
				id: 301,
				titleKey: "blog",
				newTab: false,
				path: "/blog",
			},
			{
				id: 304,
				titleKey: "signIn",
				newTab: false,
				path: "/auth/signin",
			},
			{
				id: 305,
				titleKey: "signUp",
				newTab: false,
				path: "/auth/signup",
			},
			{
				id: 306,
				titleKey: "errors",
				newTab: false,
				path: "/error",
			},
			{
				id: 303,
				titleKey: "support",
				newTab: false,
				path: "/support",
			},
			{
				id: 301,
				titleKey: "blogDetails",
				newTab: false,
				path: "/blog/proin-ac-ipsum-et-neque-tincidunt-aliquam-ut-ut-ex-in-viverra",
			},
		],
	},
	{
		id: 4,
		titleKey: "buyNow",
		newTab: false,
		path: "#pricing",
	},
];
