/**
 * Inline separator for metadata strips.
 *
 * Replaces the interpunct. The founder's objection is that "·" reads
 * as machine-generated, and he is right that it was load-bearing in
 * the wrong way: the plan used it 77 times, so every metadata row
 * looked like the same generated string.
 *
 * A hairline rule separates without adding a glyph to the sentence,
 * and it is the device the rest of the document already uses for
 * division. aria-hidden because it carries no meaning a screen reader
 * needs; the surrounding spans are already separate nodes.
 */
export default function Sep({ className = "" }: { className?: string }) {
	return (
		<span
			aria-hidden
			className={`inline-block h-3 w-px shrink-0 bg-edge align-middle ${className}`}
		/>
	);
}
