const config = {
	projectId: process.env.NEXT_PUBLIC_SANITY_PROJECT_ID || "a1b2c3d4",
	dataset: "production",
	apiVersion: "2023-03-09",
	useCdn: false,
	token: process.env.SANITY_API_KEY || "",
};

export default config;
