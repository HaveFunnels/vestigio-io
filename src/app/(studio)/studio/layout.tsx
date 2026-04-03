export const metadata = {
	title: "Vestigio Studio",
	description: "Content management for Vestigio",
};

export default function StudioLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<html lang='en'>
			<body style={{ margin: 0 }}>{children}</body>
		</html>
	);
}
