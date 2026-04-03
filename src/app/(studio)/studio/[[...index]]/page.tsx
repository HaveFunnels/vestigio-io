"use client";

export default function AdminPage() {
	const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID;
	if (!projectId || projectId === "disabled") {
		return <div className="p-8 text-center text-gray-500">Sanity Studio is not configured.</div>;
	}

	// Lazy load studio only when configured
	const { NextStudio } = require("next-sanity/studio");
	const config = require("../../../../../sanity.config").default;
	return <NextStudio config={config} />;
}
