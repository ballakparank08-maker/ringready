import { Link } from 'react-router';
import type { Route } from './+types/auth';
import { AuthForm } from '@/components/auth/auth-form';
import { seo } from '@/lib/seo';

export function meta({ matches, location }: Route.MetaArgs) {
	return seo({ matches, location }, {
		title: 'Sign in — RingReady',
		description: 'Sign in or create a free RingReady account to start practicing real phone calls with an AI voice.',
	});
}

export default function AuthPage() {
	return (
		<div className="flex min-h-dvh flex-col bg-background">
			<header className="border-b border-border">
				<div className="mx-auto flex h-20 w-full max-w-6xl items-center px-5">
					<Link to="/" className="group flex items-center gap-3">
						<span className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-primary/40 bg-black/60 shadow-[0_0_15px_rgba(212,175,55,0.15)] transition-all duration-300 group-hover:border-primary group-hover:shadow-[0_0_20px_rgba(212,175,55,0.35)]">
							<img
								src="/logo-128.png"
								alt="RingReady TM Logo"
								className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
							/>
						</span>
						<span className="flex flex-col leading-none">
							<span className="font-display text-xl font-semibold tracking-[0.18em] text-gold-leaf">RINGREADY</span>
							<span className="mt-1 font-mono text-[9px] tracking-[0.4em] text-muted-foreground uppercase">
								Est. MCMXXV
							</span>
						</span>
					</Link>
				</div>
			</header>
			<main className="relative flex flex-1 items-center justify-center overflow-hidden px-5 py-16">
				<div
					aria-hidden
					className="pointer-events-none absolute -top-32 -right-32 h-[28rem] w-[28rem] opacity-[0.1]"
					style={{
						background:
							'repeating-conic-gradient(from 0deg at 50% 50%, hsl(var(--primary)) 0deg 6deg, transparent 6deg 12deg)',
					}}
				/>
				<div aria-hidden className="absolute -bottom-24 -left-24 h-72 w-72 -rotate-3 bg-accent/50" />
				<div className="relative w-full max-w-md">
					<AuthForm />
				</div>
			</main>
		</div>
	);
}
