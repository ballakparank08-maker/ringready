import { Link } from 'react-router';
import { ArrowUpRight } from 'lucide-react';
import { SCENARIOS } from '@/data/scenarios';

const DIFFICULTY_STYLES: Record<string, string> = {
	Easy: 'text-primary border-primary/50',
	Medium: 'text-foreground border-border',
	Hard: 'text-destructive border-destructive/50',
};

export function ScenarioGrid() {
	return (
		<section id="scenarios" className="relative border-b border-border">
			<div className="mx-auto w-full max-w-6xl px-5 py-24 md:py-32">
				<div className="flex flex-wrap items-end justify-between gap-6">
					<div>
						<p className="flex items-center gap-3 font-mono text-[11px] tracking-[0.35em] text-primary uppercase">
							<span className="h-px w-8 bg-primary/60" />
							Studio — Scenarios
						</p>
						<h2 className="mt-5 font-display text-4xl font-semibold tracking-tight sm:text-5xl">
							Pick your <span className="text-gold-leaf italic">call.</span>
						</h2>
					</div>
					<p className="max-w-sm font-sans text-base leading-relaxed text-muted-foreground">
						Each scenario puts a different character on the line, with a goal to reach before you hang up.
					</p>
				</div>

				<div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
					{SCENARIOS.map((scenario) => {
						const Icon = scenario.icon;

						return (
							<Link
								key={scenario.id}
								to={`/call/${scenario.id}`}
								className="group relative flex flex-col border border-border bg-card p-7 transition-all duration-300 hover:-translate-y-1 hover:border-primary/60 hover:shadow-gold"
							>
								<div className="flex items-start justify-between">
									<span className="flex h-11 w-11 items-center justify-center border border-primary/40 text-primary">
										<Icon className="h-5 w-5" strokeWidth={1.6} />
									</span>
									<span className="font-mono text-xs text-muted-foreground tabular-nums">{scenario.index}</span>
								</div>
								<h3 className="mt-6 font-display text-2xl font-semibold tracking-tight">
									{scenario.title}
								</h3>
								<p className="mt-3 flex-1 font-sans text-base leading-relaxed text-muted-foreground">
									{scenario.tagline}
								</p>
								<div className="mt-6 flex items-center justify-between border-t border-border pt-4">
									<div className="flex items-center gap-2 font-mono text-[10px] tracking-[0.25em] uppercase">
										<span className={`border px-2.5 py-0.5 ${DIFFICULTY_STYLES[scenario.difficulty]}`}>
											{scenario.difficulty}
										</span>
										<span className="text-muted-foreground">{scenario.minutes}</span>
									</div>
									<ArrowUpRight className="h-4 w-4 text-muted-foreground transition-all group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-primary" />
								</div>
							</Link>
						);
					})}
				</div>
			</div>
		</section>
	);
}
