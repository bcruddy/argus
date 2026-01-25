'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

interface UseIntersectionObserverOptions {
	threshold?: number;
	rootMargin?: string;
	enabled?: boolean;
}

/**
 * Custom hook for Intersection Observer API
 * Returns a ref to attach to the sentinel element and whether it's intersecting
 */
export function useIntersectionObserver<T extends HTMLElement = HTMLDivElement>({
	threshold = 0,
	rootMargin = '100px',
	enabled = true,
}: UseIntersectionObserverOptions = {}) {
	const [isIntersecting, setIsIntersecting] = useState(false);
	const targetRef = useRef<T | null>(null);

	const setRef = useCallback((node: T | null) => {
		targetRef.current = node;
	}, []);

	useEffect(() => {
		const target = targetRef.current;
		if (!target) return;

		const observer = new IntersectionObserver(
			(entries) => {
				// Only update if the entry is for our target and enabled
				const entry = entries.find((e) => e.target === target);
				if (entry) {
					// Only report true intersection if enabled, always allow false
					setIsIntersecting(enabled && entry.isIntersecting);
				}
			},
			{
				threshold,
				rootMargin,
			},
		);

		observer.observe(target);

		return () => {
			observer.disconnect();
		};
	}, [threshold, rootMargin, enabled]);

	return { ref: setRef, isIntersecting };
}
