import { Link } from 'react-router';

export function SiteFooter() {
	return (
		<footer className="border-t border-border">
			<div className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-5 py-14 md:flex-row md:items-end md:justify-between">
				<div>
					<div className="flex items-center gap-3">
						<span className="relative flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-md border border-primary/40 bg-black/60 shadow-[0_0_12px_rgba(212,175,55,0.15)]">
							<img
								src="/logo-128.png"
								alt="RingReady TM Logo"
								className="h-full w-full object-cover"
							/>
						</span>
						<span className="font-display text-lg font-semibold tracking-[0.18em] text-gold-leaf">RINGREADY</span>
					</div>
					<p className="mt-4 max-w-xs font-sans text-base leading-relaxed text-muted-foreground">
						Rehearse the calls that matter with a lifelike AI voice on the other end of the line.
					</p>
				</div>

				<nav className="flex gap-12 font-mono text-[11px] tracking-[0.25em] text-muted-foreground uppercase">
					<div className="flex flex-col gap-3">
						<span className="font-display text-xs tracking-[0.25em] text-primary">Practice</span>
						<Link to="/#scenarios" className="transition-colors hover:text-primary">Studio</Link>
						<Link to="/#how-it-works" className="transition-colors hover:text-primary">Evaluation</Link>
					</div>
					<div className="flex flex-col gap-3">
						<span className="font-display text-xs tracking-[0.25em] text-primary">Account</span>
						<Link to="/auth" className="transition-colors hover:text-primary">Sign in</Link>
						<Link to="/auth" className="transition-colors hover:text-primary">Create account</Link>
					</div>
				</nav>
			</div>
			<div className="border-t border-border">
				<div className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-5 font-mono text-[10px] tracking-[0.3em] text-muted-foreground uppercase">
					<span>© {new Date().getFullYear()} RingReady</span>
					<span className="text-primary/70">Voice practice, on demand</span>
				</div>
			</div>
		</footer>
	);
}
