import { Metadata } from "next";

export const metadata: Metadata = {
	title: "Privacy Policy — Vestigio",
	description: "Privacy Policy for Vestigio. Learn how we collect, use, and protect your personal information.",
	openGraph: {
		title: "Privacy Policy — Vestigio",
		description: "Privacy Policy for Vestigio. Learn how we collect, use, and protect your personal information.",
	},
};

const PrivacyPage = () => {
	return (
		<main className='min-h-screen bg-[#090911]'>
			<div className='mx-auto max-w-3xl px-4 py-20 sm:px-8 sm:py-28'>
				<h1 className='mb-3 text-3xl font-bold tracking-tight text-white sm:text-4xl'>
					Privacy Policy
				</h1>
				<p className='mb-12 text-sm text-zinc-500'>
					Last updated: April 12, 2026
				</p>

				<div className='space-y-10'>
					<section>
						<h2 className='mb-4 text-lg font-semibold text-white'>
							1. Information We Collect
						</h2>
						<p className='leading-relaxed text-zinc-400'>
							Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.
						</p>
					</section>

					<section>
						<h2 className='mb-4 text-lg font-semibold text-white'>
							2. How We Use Your Information
						</h2>
						<p className='leading-relaxed text-zinc-400'>
							Pellentesque habitant morbi tristique senectus et netus et malesuada fames ac turpis egestas. Vestibulum tortor quam, feugiat vitae, ultricies eget, tempor sit amet, ante. Donec eu libero sit amet quam egestas semper. Aenean ultricies mi vitae est. Mauris placerat eleifend leo. Quisque sit amet est et sapien ullamcorper pharetra. Vestibulum erat wisi, condimentum sed, commodo vitae, ornare sit amet, wisi.
						</p>
					</section>

					<section>
						<h2 className='mb-4 text-lg font-semibold text-white'>
							3. Data Security
						</h2>
						<p className='leading-relaxed text-zinc-400'>
							Curabitur blandit tempus porttitor. Nullam quis risus eget urna mollis ornare vel eu leo. Donec id elit non mi porta gravida at eget metus. Maecenas sed diam eget risus varius blandit sit amet non magna. Cras mattis consectetur purus sit amet fermentum. Praesent commodo cursus magna, vel scelerisque nisl consectetur et.
						</p>
					</section>

					<section>
						<h2 className='mb-4 text-lg font-semibold text-white'>
							4. Your Rights
						</h2>
						<p className='leading-relaxed text-zinc-400'>
							Fusce dapibus, tellus ac cursus commodo, tortor mauris condimentum nibh, ut fermentum massa justo sit amet risus. Etiam porta sem malesuada magna mollis euismod. Donec sed odio dui. Aenean eu leo quam. Pellentesque ornare sem lacinia quam venenatis vestibulum. Nulla vitae elit libero, a pharetra augue.
						</p>
					</section>
				</div>

				<div className='mt-14 rounded-xl border border-zinc-800 bg-zinc-900/50 px-6 py-4'>
					<p className='text-sm text-zinc-500'>
						This is a placeholder. The actual policy will be published soon.
					</p>
				</div>
			</div>
		</main>
	);
};

export default PrivacyPage;
