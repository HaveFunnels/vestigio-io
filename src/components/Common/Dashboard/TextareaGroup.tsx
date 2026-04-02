"use client";

export default function TextareaGroup(props: any) {
	const { name, label, value, placeholder, handleChange, rows } = props;

	return (
		<div>
			<label
				htmlFor={name}
				className='mb-2.5 block font-satoshi text-base font-medium text-dark dark:text-zinc-100'
			>
				{label}
			</label>
			<div className='relative'>
				<textarea
					placeholder={placeholder}
					value={value}
					onChange={handleChange}
					rows={rows}
					className={`w-full resize-none rounded-lg border border-gray-3 px-5.5 py-3 text-dark outline-none duration-300 focus:border-emerald-600 focus:ring-1 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:focus:border-emerald-600`}
				/>
			</div>
		</div>
	);
}
