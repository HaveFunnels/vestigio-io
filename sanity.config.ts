import schemas from "@/sanity/schemas";
import { defineConfig } from "sanity";
import { deskTool } from "sanity/desk";

// Project ID is hardcoded as the safe fallback because NEXT_PUBLIC_* env vars
// are only replaced at webpack compile time — if the Railway build doesn't have
// the var available during the build step, the client bundle gets the fallback
// baked in. The project ID is public (appears in every Sanity API URL), so
// hardcoding it is safe and ensures the studio always works regardless of
// build-time env var availability.
const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID || "9azjkl3r";

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
