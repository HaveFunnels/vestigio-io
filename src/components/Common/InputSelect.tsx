import { useId } from "react";

const arrowIcon = (
	<svg
		width='26'
		height='26'
		viewBox='0 0 16 16'
		fill='none'
		xmlns='http://www.w3.org/2000/svg'
	>
		<path
			fillRule='evenodd'
			clipRule='evenodd'
			d='M2.95339 5.67461C3.1331 5.46495 3.44875 5.44067 3.65841 5.62038L7.99968 9.34147L12.341 5.62038C12.5506 5.44067 12.8663 5.46495 13.046 5.67461C13.2257 5.88428 13.2014 6.19993 12.9917 6.37964L8.32508 10.3796C8.13783 10.5401 7.86153 10.5401 7.67429 10.3796L3.00762 6.37964C2.79796 6.19993 2.77368 5.88428 2.95339 5.67461Z'
			fill='currentColor'
		/>
	</svg>
);

export default function InputSelect(props: any) {
	const { name, label, options, onChange, value, required, placeholder } =
		props;
	const id = useId();

	return (
		<div>
			<label
				htmlFor={id}
				className='mb-2.5 block font-satoshi text-base font-medium text-dark dark:text-zinc-100'
			>
				{label}
			</label>
			<div className='relative'>
				<select
					name={name}
					id={id}
					value={value}
					onChange={onChange}
					required={required}
					className='relative z-20 h-[52px] w-full appearance-none rounded-lg border border-gray-3 bg-transparent py-3 pl-5.5 text-dark outline-none duration-300 focus:border-emerald-600 focus:ring-1 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:focus:border-emerald-600'
				>
					<option hidden className='dark:bg-zinc-900'>
						{placeholder}
					</option>

					{options?.map((option: any) => (
						<option
							key={option?.value}
							value={option?.value}
							className='dark:bg-zinc-900'
						>
							{option?.label}
						</option>
					))}
				</select>
				<span className='absolute right-5.5 top-1/2 z-10 -translate-y-1/2'>
					{arrowIcon}
				</span>
			</div>
		</div>
	);
}
