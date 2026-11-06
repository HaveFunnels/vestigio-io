import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { Fragment, useEffect, useState } from "react";
import fs from "node:fs";
import path from "node:path";

// Switching environments set the cookie, re-rendered the server layout
// and showed a skeleton, and still appeared to do nothing: when the
// skeleton cleared, React saw the same component in the same position
// and preserved its state, so any client page fetching in a useEffect
// with an env-independent dependency list never re-fetched.
//
// Measured across the app at the time of the fix: 50 such effects in 42
// files. Patching every dependency list would have been 42 chances to
// break an effect; keying the shell remounts all of them at once.

const SHELL = fs.readFileSync(
	path.join(__dirname, "AppSidebarLayout.tsx"),
	"utf8",
);

describe("the shell keys page content on the environment", () => {
	it("wraps children in a keyed Fragment", () => {
		expect(SHELL).toContain('<Fragment key={orgCtx.envId ?? "no-env"}>{children}</Fragment>');
	});

	it("uses a Fragment, not a div", () => {
		// A wrapper element would insert a DOM node into the flex and
		// height chain the shell depends on.
		expect(SHELL).not.toMatch(/<div key=\{orgCtx\.envId/);
	});
});

describe("the remount behaviour this relies on", () => {
	// Guards the React semantics the fix leans on, so a future refactor
	// that drops the key fails here with an explanation rather than
	// silently restoring the stale-data bug.
	function Child({ onMount }: { onMount: () => void }) {
		useEffect(() => {
			onMount();
		}, [onMount]);
		return <span>child</span>;
	}

	function Shell({ envId, onMount, keyed }: { envId: string; onMount: () => void; keyed: boolean }) {
		const child = <Child onMount={onMount} />;
		return keyed ? <Fragment key={envId}>{child}</Fragment> : <Fragment>{child}</Fragment>;
	}

	it("re-runs the child's effect when the key changes", () => {
		let mounts = 0;
		const onMount = () => {
			mounts++;
		};
		const { rerender } = render(<Shell envId="env_a" onMount={onMount} keyed />);
		expect(mounts).toBe(1);
		rerender(<Shell envId="env_b" onMount={onMount} keyed />);
		expect(mounts).toBe(2);
	});

	it("does NOT re-run it without the key, which was the bug", () => {
		let mounts = 0;
		const onMount = () => {
			mounts++;
		};
		const { rerender } = render(<Shell envId="env_a" onMount={onMount} keyed={false} />);
		expect(mounts).toBe(1);
		rerender(<Shell envId="env_b" onMount={onMount} keyed={false} />);
		// Same component, same position, state preserved: the page keeps
		// whatever the previous environment's fetch put there.
		expect(mounts).toBe(1);
	});

	it("resets child state, which is the point on a tenant switch", () => {
		function Stateful({ seed }: { seed: string }) {
			const [value] = useState(seed);
			return <span data-testid="v">{value}</span>;
		}
		function S({ envId, seed }: { envId: string; seed: string }) {
			return (
				<Fragment key={envId}>
					<Stateful seed={seed} />
				</Fragment>
			);
		}
		const { rerender, getByTestId } = render(<S envId="a" seed="loja-1" />);
		expect(getByTestId("v").textContent).toBe("loja-1");
		rerender(<S envId="b" seed="loja-2" />);
		// Carrying loja-1's filters into loja-2 is the quieter form of
		// the same bug, so discarding state here is correct.
		expect(getByTestId("v").textContent).toBe("loja-2");
	});
});
