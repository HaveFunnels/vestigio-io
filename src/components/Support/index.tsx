"use client";
import { useTranslations } from "next-intl";

const Support = () => {
	const t = useTranslations("support_page");

	return (
		<section className='min-h-screen bg-[#090911] px-4 pb-20 pt-32 sm:px-8'>
			<div className='mx-auto w-full max-w-[1170px]'>
				{/* Header */}
				<div className='mx-auto mb-16 max-w-[600px] text-center'>
					<h1 className='mb-4 text-3xl font-bold tracking-tight text-white lg:text-4xl'>
						{t("heading")}
					</h1>
					<p className='text-base text-gray-400'>
						{t("subtitle")}
					</p>
				</div>

				{/* Content grid */}
				<div className='mx-auto grid max-w-[900px] gap-6 lg:grid-cols-2'>
					{/* Form */}
					<div className='rounded-[1rem] border border-white/[0.06] bg-white/[0.03] p-8 backdrop-blur-sm'>
						<h2 className='mb-6 text-lg font-semibold text-white'>
							Send us a message
						</h2>
						<form className='space-y-5'>
							<div>
								<label
									htmlFor='fullName'
									className='mb-2 block text-sm font-medium text-gray-300'
								>
									{t("form.full_name.label")}
								</label>
								<input
									type='text'
									name='fullName'
									id='fullName'
									autoComplete='name'
									placeholder={t("form.full_name.placeholder")}
									className='w-full rounded-[1rem] border border-white/[0.06] bg-white/[0.03] px-4 py-3 text-sm text-white outline-none placeholder:text-gray-600 focus:border-emerald-500/30 focus:ring-1 focus:ring-emerald-500/20'
								/>
							</div>

							<div>
								<label
									htmlFor='email'
									className='mb-2 block text-sm font-medium text-gray-300'
								>
									{t("form.email.label")}
								</label>
								<input
									type='email'
									name='email'
									id='email'
									autoComplete='email'
									placeholder={t("form.email.placeholder")}
									className='w-full rounded-[1rem] border border-white/[0.06] bg-white/[0.03] px-4 py-3 text-sm text-white outline-none placeholder:text-gray-600 focus:border-emerald-500/30 focus:ring-1 focus:ring-emerald-500/20'
								/>
							</div>

							<div>
								<label
									htmlFor='message'
									className='mb-2 block text-sm font-medium text-gray-300'
								>
									{t("form.message.label")}
								</label>
								<textarea
									name='message'
									id='message'
									rows={5}
									placeholder={t("form.message.placeholder")}
									className='w-full rounded-[1rem] border border-white/[0.06] bg-white/[0.03] px-4 py-3 text-sm text-white outline-none placeholder:text-gray-600 focus:border-emerald-500/30 focus:ring-1 focus:ring-emerald-500/20'
								/>
							</div>

							<button
								type='submit'
								className='w-full rounded-[1rem] bg-white px-6 py-3 text-sm font-semibold text-black transition-colors hover:bg-gray-100'
							>
								{t("form.submit")}
							</button>
						</form>
					</div>

					{/* Info card */}
					<div className='flex flex-col gap-6'>
						<div className='rounded-[1rem] border border-white/[0.06] bg-white/[0.03] p-8 backdrop-blur-sm'>
							<div className='mb-4 flex h-10 w-10 items-center justify-center rounded-[0.75rem] bg-emerald-500/10'>
								<svg className='h-5 w-5 text-emerald-400' fill='none' viewBox='0 0 24 24' strokeWidth={1.5} stroke='currentColor'>
									<path strokeLinecap='round' strokeLinejoin='round' d='M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75' />
								</svg>
							</div>
							<h3 className='mb-2 text-base font-semibold text-white'>Email Support</h3>
							<p className='text-sm text-gray-400'>
								We typically respond within 24 hours on business days.
							</p>
						</div>

						<div className='rounded-[1rem] border border-white/[0.06] bg-white/[0.03] p-8 backdrop-blur-sm'>
							<div className='mb-4 flex h-10 w-10 items-center justify-center rounded-[0.75rem] bg-violet-500/10'>
								<svg className='h-5 w-5 text-violet-400' fill='none' viewBox='0 0 24 24' strokeWidth={1.5} stroke='currentColor'>
									<path strokeLinecap='round' strokeLinejoin='round' d='M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25' />
								</svg>
							</div>
							<h3 className='mb-2 text-base font-semibold text-white'>Documentation</h3>
							<p className='text-sm text-gray-400'>
								Check our docs and blog for guides, best practices, and platform updates.
							</p>
						</div>

						<div className='rounded-[1rem] border border-white/[0.06] bg-white/[0.03] p-8 backdrop-blur-sm'>
							<div className='mb-4 flex h-10 w-10 items-center justify-center rounded-[0.75rem] bg-amber-500/10'>
								<svg className='h-5 w-5 text-amber-400' fill='none' viewBox='0 0 24 24' strokeWidth={1.5} stroke='currentColor'>
									<path strokeLinecap='round' strokeLinejoin='round' d='M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z' />
								</svg>
							</div>
							<h3 className='mb-2 text-base font-semibold text-white'>Community</h3>
							<p className='text-sm text-gray-400'>
								Join our community on X and GitHub for discussions and feature requests.
							</p>
						</div>
					</div>
				</div>
			</div>
		</section>
	);
};

export default Support;
