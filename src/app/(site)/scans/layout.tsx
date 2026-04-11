import { Metadata } from "next";

export const metadata: Metadata = {
	title: "Scan Results — Vestigio",
	robots: {
		index: false,
		follow: false,
	},
};

export default function ScansLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return <>{children}</>;
}
