export function excludeFields<
	T extends Record<string, unknown>,
	K extends keyof T,
>(record: T, keys: K[]) {
	return Object.fromEntries(
		Object.entries(record).filter(([key]) => !keys.includes(key as K))
	) as Omit<T, K>;
}
