import { Mic, PhoneOutgoing, ScrollText } from 'lucide-react';

const STEPS = [
	{
		number: '01',
		title: 'Choose a scenario',
		body: 'Interviews, negotiations, support calls — each one casts a different character with a goal for you to reach.',
		icon: PhoneOutgoing,
	},
	{
		number: '02',
		title: 'Talk out loud',
		body: 'Speak naturally. The AI listens, thinks, and answers with a human voice — interruptions, pauses and all.',
		icon: Mic,
	},
	{
		number: '03',
		title: 'Review and redial',
		body: 'Read the full transcript, spot where you hesitated, then call again until it feels easy.',
		icon: ScrollText,
	},
];

export function HowItWorks() {
	return (
		<section id="how-it-works" className="relative border-b border-border bg-card/40">
			<div className="mx-auto w-full max-w-6xl px-5 py-24 md:py-32">
				<p className="flex items-center gap-3 font-mono text-[11px] tracking-[0.35em] text-primary uppercase">
					<span className="h-px w-8 bg-primary/60" />
					Evaluation — How it works
				</p>
				<h2 className="mt-5 max-w-2xl font-display text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
					Three steps between you and a <span className="text-gold-leaf italic">calmer call.</span>
				</h2>

				<div className="mt-14 grid gap-px border border-border bg-border md:grid-cols-3">
					{STEPS.map((step) => {
						const Icon = step.icon;

						return (
							<div key={step.number} className="relative bg-background p-9">
								<div className="flex items-center justify-between">
									<span className="font-display text-lg tracking-[0.2em] text-gold-leaf">{step.number}</span>
									<Icon className="h-5 w-5 text-muted-foreground" strokeWidth={1.6} />
								</div>
								<h3 className="mt-8 font-display text-2xl font-semibold tracking-tight">{step.title}</h3>
								<p className="mt-3 font-sans text-base leading-relaxed text-muted-foreground">{step.body}</p>
							</div>
						);
					})}
				</div>
			</div>
		</section>
	);
}
