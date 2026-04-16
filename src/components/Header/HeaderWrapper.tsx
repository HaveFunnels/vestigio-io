"use client";
import Header from ".";
import AnnouncementBanner from "@/components/AnnouncementBanner";
import { usePathname } from "next/navigation";

export const HeaderWrapper = () => {
	const pathname = usePathname();

	// Suppress the whole top-bar stack on admin/user/auth routes — those use
	// their own app shell and don't want the marketing banner or header.
	if (
		pathname.startsWith("/admin") ||
		pathname.startsWith("/user") ||
		pathname.startsWith("/auth")
	) {
		return null;
	}

	return (
		<>
			<AnnouncementBanner />
			<Header />
		</>
	);
};
