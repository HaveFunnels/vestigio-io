// CountUp.tsx
import React, { useEffect, useState, useRef } from "react";

interface CountUpProps {
	targetNumber: number;
}

const CountUp: React.FC<CountUpProps> = ({ targetNumber }) => {
	const [count, setCount] = useState(0);
	const countRef = useRef<HTMLSpanElement>(null);

	const handleIntersection: IntersectionObserverCallback = (entries) => {
		const entry = entries[0];
		if (entry.isIntersecting) {
			startCount();
		}
	};

	const startCount = () => {
		let startTime: number | undefined;
		const duration = 1000; // You can adjust the duration

		const animate = (time: number) => {
			if (!startTime) startTime = time;
			const progress = (time - startTime) / duration;
			const currentCount = Math.ceil(progress * targetNumber);

			// Ensure the currentCount does not exceed the targetNumber
			setCount(currentCount > targetNumber ? targetNumber : currentCount);

			if (progress < 1 && count < targetNumber) {
				requestAnimationFrame(animate);
			}
		};

		requestAnimationFrame(animate);
	};

	useEffect(() => {
		// threshold: 0.25 ensures the counter triggers once the element is
		// meaningfully in view on both desktop and mobile, without waiting
		// for the element to be fully centered.
		const observer = new IntersectionObserver(handleIntersection, {
			threshold: 0.25,
			rootMargin: "0px 0px -10% 0px",
		});
		if (countRef.current) {
			observer.observe(countRef.current);
		}

		return () => {
			observer.disconnect();
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	return (
		<span className='counter mr-4 inline-block' ref={countRef}>
			{count}
		</span>
	);
};

export default CountUp;
