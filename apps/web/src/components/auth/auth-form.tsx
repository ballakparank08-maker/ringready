import { useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { AlertCircle, ArrowRight, MailCheck } from 'lucide-react';
import useAuth from '@/hooks/use-auth';
import pb from '@/lib/pocketbase-client';

const friendlyError = (error: unknown): string => {
	const message = error instanceof Error ? error.message : '';

	if (message.includes('Failed to authenticate')) {
		return 'Wrong email or password. Try again.';
	}

	if (message.includes('Failed to create record')) {
		return 'Could not create the account — is this email already registered?';
	}

	return message || 'Something went wrong. Please try again.';
};

export function AuthForm() {
	const { isAuthed, isLoading, login, signup } = useAuth();
	const navigate = useNavigate();
	const [searchParams] = useSearchParams();
	const next = searchParams.get('next') ?? '/';

	const [mode, setMode] = useState<'signin' | 'signup'>('signin');
	const [email, setEmail] = useState('');
	const [password, setPassword] = useState('');
	const [pending, setPending] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [verifyNotice, setVerifyNotice] = useState(false);
	// Tracks the verification-email delivery status so the user always knows
	// whether a link is on its way, already sent, or failed to send.
	const [sendStatus, setSendStatus] = useState<'idle' | 'sending' | 'sent' | 'failed'>('idle');
	const justSignedUp = useRef(false);

	useEffect(() => {
		if (!isLoading && isAuthed && !justSignedUp.current) {
			navigate(next, { replace: true });
		}
	}, [isAuthed, isLoading, navigate, next]);

	const sendVerification = useCallback(async (resetStatus: boolean) => {
		if (!email) {
			return;
		}

		if (resetStatus) {
			setSendStatus('sending');
		}

		try {
			await pb.collection('users').requestVerification(email);
			setSendStatus('sent');
		} catch {
			// Surface the failure instead of silently pretending the email
			// went out — the user can retry or pick a different address.
			setSendStatus('failed');
		}
	}, [email]);

	const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		setPending(true);
		setError(null);

		try {
			if (mode === 'signin') {
				await login(email, password);
				navigate(next, { replace: true });
			} else {
				justSignedUp.current = true;
				await signup(email, password);
				setVerifyNotice(true);
				// Trigger the verification email from the client as a backup
				// to the server-side PocketBase hook, so delivery does not
				// depend on a single path. The hook already fires on create;
				// this is a second, observable attempt.
				void sendVerification(true);
			}
		} catch (err) {
			justSignedUp.current = false;
			setError(friendlyError(err));
		} finally {
			setPending(false);
		}
	};

	if (verifyNotice) {
		return (
			<div className="w-full max-w-md border border-primary/30 bg-card p-8 shadow-gold-deep">
				<span className="flex h-12 w-12 items-center justify-center bg-secondary text-primary">
					<MailCheck className="h-6 w-6" strokeWidth={1.8} />
				</span>
				<h1 className="mt-6 font-display text-3xl font-bold tracking-tight">Check your inbox.</h1>
				<p className="mt-3 text-sm leading-relaxed text-muted-foreground">
					We sent a verification link to <span className="text-foreground">{email}</span>. Click it
					once and every practice line stays open to you.
				</p>

				{sendStatus === 'failed' ? (
					<div
						role="alert"
						className="mt-5 flex gap-3 border border-destructive/40 bg-destructive/10 px-4 py-3"
					>
						<AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
						<div className="text-sm leading-relaxed text-destructive">
							<p>We couldn’t deliver the verification email right now.</p>
							<p className="mt-1 text-destructive/80">
								Try resending below. If it still doesn’t arrive, check your spam folder or use a
								different email address.
							</p>
						</div>
					</div>
				) : sendStatus === 'sent' ? (
					<p className="mt-5 border border-border bg-background px-4 py-3 text-xs leading-relaxed text-muted-foreground">
						No email after a minute or two? Check your spam or promotions folder — the sender is a
						no-reply address.
					</p>
				) : null}

				<button
					type="button"
					onClick={() => navigate(next, { replace: true })}
					className="mt-8 flex h-12 w-full items-center justify-center gap-2 bg-primary font-mono text-sm font-semibold tracking-widest text-primary-foreground uppercase transition-transform hover:-translate-y-0.5 active:translate-y-0"
				>
					Continue
					<ArrowRight className="h-4 w-4" />
				</button>
				<button
					type="button"
					onClick={() => void sendVerification(true)}
					disabled={sendStatus === 'sending'}
					className="mt-3 flex h-12 w-full items-center justify-center border border-border font-mono text-xs tracking-widest text-muted-foreground uppercase transition-colors hover:border-primary hover:text-primary disabled:opacity-50"
				>
					{sendStatus === 'sending'
						? 'Sending…'
						: sendStatus === 'failed'
							? 'Try sending again'
							: 'Resend verification link'}
				</button>
			</div>
		);
	}

	return (
		<div className="w-full max-w-md">
			<div className="border border-primary/30 bg-card p-8 shadow-gold-deep">
				<p className="font-mono text-[11px] tracking-[0.3em] text-primary uppercase">
					{mode === 'signin' ? 'Welcome back' : 'Create your account'}
				</p>
				<h1 className="mt-4 font-display text-3xl font-bold tracking-tight">
					{mode === 'signin' ? 'Sign in to dial in.' : 'Pick up the line.'}
				</h1>
				<p className="mt-3 text-sm leading-relaxed text-muted-foreground">
					{mode === 'signin'
						? 'Your practice calls and transcripts are waiting.'
						: 'Free account, verified email — then unlimited practice calls.'}
				</p>

				<form onSubmit={onSubmit} className="mt-8 flex flex-col gap-5">
					<div className="flex flex-col gap-2">
						<label htmlFor="email" className="font-mono text-xs tracking-widest text-muted-foreground uppercase">
							Email
						</label>
						<input
							id="email"
							type="email"
							required
							autoComplete="email"
							value={email}
							onChange={event => setEmail(event.target.value)}
							placeholder="you@example.com"
							className="h-12 border border-input bg-background px-4 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none"
						/>
					</div>
					<div className="flex flex-col gap-2">
						<label htmlFor="password" className="font-mono text-xs tracking-widest text-muted-foreground uppercase">
							Password
						</label>
						<input
							id="password"
							type="password"
							required
							minLength={8}
							autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
							value={password}
							onChange={event => setPassword(event.target.value)}
							placeholder="At least 8 characters"
							className="h-12 border border-input bg-background px-4 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none"
						/>
					</div>

					{error ? (
						<p role="alert" className="border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
							{error}
						</p>
					) : null}

					<button
						type="submit"
						disabled={pending}
						className="flex h-12 items-center justify-center gap-2 bg-primary font-mono text-sm font-semibold tracking-widest text-primary-foreground uppercase transition-transform hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-60"
					>
						{pending ? 'One moment…' : mode === 'signin' ? 'Sign in' : 'Create account'}
						{!pending && <ArrowRight className="h-4 w-4" />}
					</button>
				</form>
			</div>

			<p className="mt-6 text-center text-sm text-muted-foreground">
				{mode === 'signin' ? 'New to RingReady?' : 'Already have an account?'}{' '}
				<button
					type="button"
					onClick={() => {
						setMode(mode === 'signin' ? 'signup' : 'signin');
						setError(null);
					}}
					className="font-medium text-primary underline-offset-4 hover:underline"
				>
					{mode === 'signin' ? 'Create an account' : 'Sign in'}
				</button>
			</p>
		</div>
	);
}
