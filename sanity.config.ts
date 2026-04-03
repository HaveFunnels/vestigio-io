import schemas from "@/sanity/schemas";
import { defineConfig } from "sanity";
import { deskTool } from "sanity/desk";

const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID || "placeholder";

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
