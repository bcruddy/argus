'use client';

import { useCallback, useSyncExternalStore } from 'react';

// Layout follows Tailwind's `md` breakpoint directly (`md:hidden` / `hidden md:block`).
// These mirror it for the one thing CSS cannot do: decide which query is allowed to fetch.
export const MOBILE_MEDIA_QUERY = '(max-width: 767px)';
export const REDUCED_MOTION_MEDIA_QUERY = '(prefers-reduced-motion: reduce)';

// One MediaQueryList per query string, so every subscriber shares a listener and
// getSnapshot stays cheap.
const mediaQueryLists = new Map<string, MediaQueryList>();

function getMediaQueryList(query: string): MediaQueryList | null {
	if (typeof window === 'undefined') return null;
	let mql = mediaQueryLists.get(query);
	if (!mql) {
		mql = window.matchMedia(query);
		mediaQueryLists.set(query, mql);
	}
	return mql;
}

/**
 * `null` until the client has hydrated and can actually read the viewport, then the
 * live value. Callers gating a fetch MUST treat null as "not known yet": that is what
 * stops a phone from firing the desktop query during hydration and the mobile one a
 * tick later. Unlike a resize listener this only re-renders when the query flips, not
 * on every pixel.
 */
export function useMediaQuery(query: string): boolean | null {
	const subscribe = useCallback(
		(onStoreChange: () => void) => {
			const mql = getMediaQueryList(query);
			if (!mql) return () => {};
			mql.addEventListener('change', onStoreChange);
			return () => mql.removeEventListener('change', onStoreChange);
		},
		[query],
	);

	const getSnapshot = useCallback(() => getMediaQueryList(query)?.matches ?? null, [query]);
	const getServerSnapshot = useCallback(() => null, []);

	return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function useIsMobileViewport(): boolean | null {
	return useMediaQuery(MOBILE_MEDIA_QUERY);
}

export function usePrefersReducedMotion(): boolean | null {
	return useMediaQuery(REDUCED_MOTION_MEDIA_QUERY);
}
