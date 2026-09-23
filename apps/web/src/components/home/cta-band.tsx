import { Link } from 'react-router';
import { PhoneCall } from 'lucide-react';

export function CtaBand() {
	return (
		<section className="relative overflow-hidden border-b border-border">
			<div
				aria-hidden
				className="pointer-events-none absolute -bottom-48 -left-48 h-[30rem] w-[30rem] opacity-[0.1]"
				style={{
					background:
						'repeating-conic-gradient(from 0deg at 50% 50%, hsl(var(--primary)) 0deg 6deg, transparent 6deg 12deg)',
				}}
			/>
			<div className="relative mx-auto w-full max-w-6xl px-5 py-28 text-center md:py-36">
				<p className="font-mono text-[11px] tracking-[0.35em] text-primary uppercase">
					Your next real call will feel familiar
				</p>
				<h2 className="mx-auto mt-6 max-w-3xl font-display text-4xl font-semibold tracking-tight text-balance sm:text-6xl">
					The line is open. <span className="text-gold-leaf italic">Dial in.</span>
				</h2>
				<Link
					to="/call/identity-theft-intake"
					className="mt-10 inline-flex h-12 items-center gap-2 border border-primary bg-primary px-9 font-display text-sm font-semibold tracking-[0.2em] text-primary-foreground uppercase shadow-gold transition-all hover:-translate-y-0.5 active:translate-y-0"
				>
					<PhoneCall className="h-4 w-4" strokeWidth={2} />
					Start practicing free
				</Link>
			</div>
		</section>
	);
}
