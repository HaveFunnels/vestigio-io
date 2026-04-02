export default async function getUpdatedData() {
	try {
		const res = await fetch(`/api/user/fetch-user`);

		return await res.json();
	} catch (error) {
		return null;
	}
}
