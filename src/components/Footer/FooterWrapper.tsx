"use client";
import { usePathname } from "next/navigation";
import Footer from ".";

const FooterWrapper = () => {
	const pathname = usePathname();

	return (
		<>
			{!pathname.startsWith("/admin") &&
				!pathname.startsWith("/user") &&
				!pathname.startsWith("/auth") &&
				!pathname.startsWith("/lp/audit") && <Footer />}
		</>
	);
};

export default FooterWrapper;
