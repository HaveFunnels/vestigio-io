import schemas from "@/sanity/schemas";
import { defineConfig } from "sanity";
import { deskTool } from "sanity/desk";

const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID || "placeholder";

// Build-time diagnostic — will appear in Railway build logs
if (typeof window === 'undefined') {
	console.log(`[sanity.config] NEXT_PUBLIC_SANITY_PROJECT_ID=${process.env.NEXT_PUBLIC_SANITY_PROJECT_ID ? 'SET' : 'MISSING'}, resolved projectId=${projectId}`);
}

const config = defineConfig({
	projectId,
	dataset: "production",
	title: process.env.NEXT_PUBLIC_SANITY_PROJECT_TITLE || "Vestigio",
	apiVersion: "2023-03-09",
	basePath: "/studio",
	plugins: [deskTool()],
	schema: { types: schemas },
});

export default config;
