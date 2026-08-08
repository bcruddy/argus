'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { formatUsd } from '@/lib/format';

interface WhaleSplashProps {
	amount: number;
	onDismiss: () => void;
}

export function WhaleSplash({ amount, onDismiss }: WhaleSplashProps) {
	const [isVisible, setIsVisible] = useState(false);

	// Randomize droplets once on mount — calling Math.random() during render
	// violates react-hooks/purity and made positions jump on re-render.
	const [droplets] = useState(() =>
		Array.from({ length: 12 }, () => ({
			left: 30 + Math.random() * 40,
			delay: Math.random() * 0.3,
			duration: 0.8 + Math.random() * 0.4,
		})),
	);

	useEffect(() => {
		// Trigger animation on mount
		const timer = setTimeout(() => setIsVisible(true), 50);
		return () => clearTimeout(timer);
	}, []);

	const handleDismiss = useCallback(() => {
		setIsVisible(false);
		setTimeout(onDismiss, 300);
	}, [onDismiss]);

	// Auto-dismiss after 4 seconds. Read the latest handler through a ref so
	// the timer stays anchored to mount instead of re-arming when the parent
	// re-renders and passes a new onDismiss identity.
	const dismissRef = useRef(handleDismiss);
	useEffect(() => {
		dismissRef.current = handleDismiss;
	}, [handleDismiss]);
	useEffect(() => {
		const timer = setTimeout(() => dismissRef.current(), 4000);
		return () => clearTimeout(timer);
	}, []);

	// Keyboard escape hatch, since the only pointer target is the bubble.
	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === 'Escape') dismissRef.current();
		};
		window.addEventListener('keydown', onKeyDown);
		return () => window.removeEventListener('keydown', onKeyDown);
	}, []);

	return (
		// The overlay stays pointer-events-none for its whole life. It used to flip to
		// 'auto' over inset-0 z-50, which ate every click on the page for ~4.3 seconds;
		// only the message bubble is interactive now.
		<div
			className={`pointer-events-none fixed inset-0 z-50 flex items-end justify-center overflow-hidden transition-opacity duration-300 ${
				isVisible ? 'opacity-100' : 'opacity-0'
			}`}
		>
			{/* Water splash background */}
			<div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-blue-500/20 to-transparent whale-wave" />

			{/* Splash droplets */}
			{droplets.map((droplet, i) => (
				<div
					key={i}
					className="absolute bottom-24 splash-droplet"
					style={{
						left: `${droplet.left}%`,
						animationDelay: `${droplet.delay}s`,
						animationDuration: `${droplet.duration}s`,
					}}
				>
					<div className="w-2 h-2 md:w-3 md:h-3 rounded-full bg-blue-400/80" />
				</div>
			))}

			{/* The whale */}
			<div className={`whale-breach ${isVisible ? 'whale-breach-active' : ''}`}>
				<svg
					viewBox="0 0 120 80"
					className="w-32 h-24 md:w-48 md:h-36 drop-shadow-lg"
					fill="none"
					aria-hidden="true"
					xmlns="http://www.w3.org/2000/svg"
				>
					{/* Whale body */}
					<ellipse cx="60" cy="50" rx="45" ry="25" className="fill-slate-600 dark:fill-slate-400" />

					{/* Whale belly */}
					<ellipse cx="60" cy="55" rx="35" ry="15" className="fill-slate-400 dark:fill-slate-300" />

					{/* Tail */}
					<path
						d="M 105 50 Q 125 35, 115 20 Q 110 30, 105 35 Q 115 25, 120 15 Q 125 35, 105 50"
						className="fill-slate-600 dark:fill-slate-400"
					/>

					{/* Dorsal fin */}
					<path d="M 55 25 Q 60 10, 70 25" className="fill-slate-600 dark:fill-slate-400" />

					{/* Side fin */}
					<ellipse
						cx="45"
						cy="55"
						rx="12"
						ry="5"
						transform="rotate(-20 45 55)"
						className="fill-slate-500 dark:fill-slate-300"
					/>

					{/* Eye */}
					<circle cx="25" cy="45" r="4" className="fill-slate-800 dark:fill-slate-200" />
					<circle cx="24" cy="44" r="1.5" className="fill-white" />

					{/* Smile */}
					<path
						d="M 18 55 Q 25 60, 35 55"
						stroke="currentColor"
						strokeWidth="2"
						strokeLinecap="round"
						className="text-slate-700 dark:text-slate-300"
						fill="none"
					/>

					{/* Water spout */}
					<g className="whale-spout">
						<path
							d="M 30 20 Q 28 5, 35 0 M 30 20 Q 32 5, 25 0"
							stroke="currentColor"
							strokeWidth="3"
							strokeLinecap="round"
							className="text-blue-400"
							fill="none"
						/>
						<circle cx="30" cy="5" r="3" className="fill-blue-400/60" />
						<circle cx="25" cy="2" r="2" className="fill-blue-400/40" />
						<circle cx="35" cy="3" r="2" className="fill-blue-400/40" />
					</g>
				</svg>
			</div>

			{/* Message bubble — the one clickable thing in the overlay */}
			<div
				className={`absolute bottom-48 md:bottom-56 left-1/2 -translate-x-1/2 whale-message ${
					isVisible ? 'whale-message-active' : ''
				}`}
			>
				<button
					type="button"
					onClick={handleDismiss}
					aria-label={`Mega whale trade of ${formatUsd(amount)} — dismiss`}
					className="pointer-events-auto bg-card border border-border rounded-xl px-4 py-3 md:px-6 md:py-4 shadow-xl text-center cursor-pointer"
				>
					<div className="text-2xl md:text-3xl mb-1">MEGA WHALE!</div>
					<div className="text-xl md:text-2xl font-bold font-mono text-primary">{formatUsd(amount)}</div>
					<div className="text-xs md:text-sm text-muted-foreground mt-1">Click or press Esc to dismiss</div>
				</button>
			</div>
		</div>
	);
}
