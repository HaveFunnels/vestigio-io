import NotFound from "@/components/404";
import { Metadata } from "next";

export const metadata: Metadata = {
	title: "Error",
};

const ErrorPage = () => {
	return (
		<>
			<NotFound />
		</>
	);
};

export default ErrorPage;
