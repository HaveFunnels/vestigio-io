import FooterWrapper from "@/components/Footer/FooterWrapper";
import { HeaderWrapper } from "@/components/Header/HeaderWrapper";
import TrackingScript from "@/components/analytics/TrackingScript";
import NextTopLoader from "nextjs-toploader";
// react-quill CSS moved to admin layout — not needed on public pages
import ToastContext from "../context/ToastContext";
import { Providers } from "./providers";

export default function RootLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<div className='isolate'>
			<ToastContext />
			<TrackingScript />
			<Providers>
				<NextTopLoader
					color='#635BFF'
					crawlSpeed={300}
					showSpinner={false}
					shadow='none'
				/>
				<HeaderWrapper />
				<div className='isolate'>{children}</div>

				<FooterWrapper />
			</Providers>
		</div>
	);
}
