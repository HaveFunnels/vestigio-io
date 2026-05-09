import { redirect } from "next/navigation";

// Old invite page — deprecated. Activation now happens at /activate/[token].
// Redirect to signin for anyone who still has this bookmarked.
export default function InvitedSigninPage() {
	redirect("/auth/signin");
}
