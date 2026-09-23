import { Link } from 'react-router';
import { ArrowDownRight, PhoneCall } from 'lucide-react';

const WAVE_HEIGHTS = ['h-3', 'h-6', 'h-9', 'h-5', 'h-10', 'h-7', 'h-4', 'h-8', 'h-5', 'h-9', 'h-6', 'h-3'];

export function Hero() {
	return (
		<section className="relative overflow-hidden border-b border-border">
			{/* Art Deco gold sunburst backdrop */}
			<div
				aria-hidden
				className="pointer-events-none absolute -top-40 -right-40 h-[34rem] w-[34rem] opacity-[0.12]"
				style={{
					background:
						'repeating-conic-gradient(from 0deg at 50% 50%, hsl(var(--primary)) 0deg 6deg, transparent 6deg 12deg)',
				}}
			/>
			<div aria-hidden className="absolute top-44 -left-44 h-80 w-80 -rotate-3 bg-accent/50" />

			<div className="relative mx-auto grid w-full max-w-6xl gap-14 px-5 pt-24 pb-28 md:pt-32 lg:grid-cols-[1.15fr_0.85fr] lg:items-center">
				<div className="animate-fade-up">
					<p className="flex items-center gap-3 font-mono text-[11px] tracking-[0.35em] text-primary uppercase">
						<span className="h-px w-8 bg-primary/60" />
						AI voice practice — real conversations — no judgement
					</p>
					<h1 className="text-balance mt-7 font-display text-5xl leading-[1.04] font-semibold tracking-tight sm:text-6xl lg:text-7xl">
						Practice the <span className="marker-underline italic">call</span>
						<br className="hidden sm:block" /> before it matters.
					</h1>
					<p className="mt-7 max-w-xl font-sans text-xl leading-relaxed text-muted-foreground">
						RingReady puts a lifelike AI voice on the other end of the line. Rehearse interviews,
						negotiations and everyday calls — out loud, in real time, as many times as it takes.
					</p>
					<div className="mt-10 flex flex-wrap items-center gap-4">
						<Link
							to="/call/identity-theft-intake"
							className="flex h-12 items-center gap-2 border border-primary bg-primary px-7 font-display text-sm font-semibold tracking-[0.2em] text-primary-foreground uppercase shadow-gold transition-all hover:-translate-y-0.5 active:translate-y-0"
						>
							<PhoneCall className="h-4 w-4" strokeWidth={2} />
							Start a practice call
						</Link>
						<a
							href="#scenarios"
							className="flex h-12 items-center gap-2 border border-border px-7 font-display text-sm tracking-[0.2em] text-foreground uppercase transition-colors hover:border-primary hover:text-primary"
						>
							Browse scenarios
							<ArrowDownRight className="h-4 w-4" />
						</a>
					</div>
				</div>

				{/* mock incoming-call card, Art Deco gold frame */}
				<div className="relative mx-auto w-full max-w-sm animate-fade-up [animation-delay:150ms]">
					<div aria-hidden className="absolute inset-0 translate-x-3 translate-y-3 bg-accent/70" />
					<div className="relative border border-primary/40 bg-card p-7 shadow-gold-deep">
						<div className="flex items-center justify-between">
							<p className="font-mono text-[10px] tracking-[0.3em] text-muted-foreground uppercase">
								Incoming practice call
							</p>
							<span className="font-mono text-[10px] tracking-[0.3em] text-primary uppercase">Live</span>
						</div>
						<div className="mt-6 flex items-center gap-4">
							<span className="relative flex h-14 w-14 items-center justify-center rounded-full border border-primary/50 font-display text-lg font-semibold text-gold-leaf">
								AM
								<span aria-hidden className="absolute inset-0 rounded-full border border-primary animate-ring" />
							</span>
							<div>
								<p className="font-display text-xl font-semibold tracking-wide">Alex Morgan</p>
								<p className="font-sans text-base text-muted-foreground">Hiring manager · Northlight Studio</p>
							</div>
						</div>
						<div className="mt-7 flex h-12 items-end justify-center gap-1.5" aria-hidden>
							{WAVE_HEIGHTS.map((height, i) => (
								<span
									key={i}
									className={`w-1.5 origin-bottom bg-primary/80 animate-wave ${height}`}
									style={{ animationDelay: `${i * 90}ms` }}
								/>
							))}
						</div>
						<div className="mt-7 flex items-center justify-between border-t border-border pt-5">
							<span className="font-mono text-xs text-muted-foreground tabular-nums">00:42</span>
							<span className="flex h-11 w-11 items-center justify-center rounded-full border border-primary bg-primary/15 text-primary">
								<PhoneCall className="h-4 w-4" strokeWidth={2} />
							</span>
							<span className="font-mono text-[10px] tracking-[0.3em] text-primary uppercase">On air</span>
						</div>
					</div>
				</div>
			</div>
		</section>
	);
}
