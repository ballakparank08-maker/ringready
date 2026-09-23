import { Link, useNavigate } from 'react-router';
import { LogOut } from 'lucide-react';
import useAuth from '@/hooks/use-auth';

export function SiteHeader() {
	const { user, isAuthed, isLoading, logout } = useAuth();
	const navigate = useNavigate();

	return (
		<header className="sticky top-0 z-40 border-b border-border bg-background/92 backdrop-blur">
			<div className="mx-auto flex h-20 w-full max-w-6xl items-center justify-between px-5">
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

				<nav className="hidden items-center gap-10 md:flex">
					<Link
						to="/#scenarios"
						className="group flex flex-col items-center font-display text-sm tracking-[0.25em] text-foreground uppercase transition-colors hover:text-primary"
					>
						Studio
						<span className="mt-1 h-px w-0 bg-primary transition-all duration-300 group-hover:w-full" />
					</Link>
					<Link
						to="/#how-it-works"
						className="group flex flex-col items-center font-display text-sm tracking-[0.25em] text-foreground uppercase transition-colors hover:text-primary"
					>
						Evaluation
						<span className="mt-1 h-px w-0 bg-primary transition-all duration-300 group-hover:w-full" />
					</Link>
				</nav>

				<div className="flex items-center gap-3">
					{isLoading ? (
						<span className="h-9 w-24 animate-pulse bg-muted" />
					) : isAuthed ? (
						<>
							<span className="hidden max-w-40 truncate font-mono text-xs text-muted-foreground sm:block">
								{user?.email}
							</span>
							<button
								type="button"
								onClick={() => {
									logout();
									navigate('/');
								}}
								className="flex h-9 items-center gap-2 border border-border px-4 font-mono text-[11px] tracking-[0.25em] text-muted-foreground uppercase transition-colors hover:border-primary hover:text-primary"
							>
								<LogOut className="h-3.5 w-3.5" />
								Sign out
							</button>
						</>
					) : (
						<Link
							to="/auth"
							className="flex h-9 items-center border border-primary bg-primary/10 px-5 font-display text-xs font-semibold tracking-[0.25em] text-primary uppercase transition-all hover:bg-primary hover:text-primary-foreground"
						>
							Sign in
						</Link>
					)}
				</div>
			</div>
		</header>
	);
}
