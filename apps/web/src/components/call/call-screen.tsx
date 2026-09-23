import { useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import {
	ArrowLeft,
	Keyboard,
	Mic,
	MicOff,
	PhoneOff,
	RotateCcw,
	ScrollText,
	Send,
	Volume2,
	VolumeX,
} from 'lucide-react';
import { AssistantError, clearChatHistory, sendMessage } from '@/api/integrated-ai-api';
import type { ChatMessage } from '@/api/integrated-ai-api';
import type { Scenario } from '@/data/scenarios';
import pb from '@/lib/pocketbase-client';
import {
	createRecognizer,
	isSpeechRecognitionSupported,
	isSpeechSynthesisSupported,
	speak,
	stopSpeaking,
} from '@/lib/speech';
import type { RecognizerHandle } from '@/lib/speech';

type CallPhase = 'connecting' | 'active' | 'ended';
type TurnState = 'idle' | 'listening' | 'thinking' | 'speaking';
type CallError = { kind: 'verify' | 'rate' | 'generic'; message: string } | null;

const WAVE_BARS = [0.35, 0.7, 1, 0.55, 0.9, 0.45, 0.8, 0.6, 1, 0.5, 0.75, 0.35];

const formatDuration = (totalSeconds: number): string => {
	const minutes = Math.floor(totalSeconds / 60);
	const seconds = totalSeconds % 60;

	return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};

const initialsOf = (name: string): string =>
	name
		.split(' ')
		.map(part => part[0])
		.join('')
		.slice(0, 2)
		.toUpperCase();

export function CallScreen({ scenario }: { scenario: Scenario }) {
	const navigate = useNavigate();

	const [phase, setPhase] = useState<CallPhase>('connecting');
	const [turnState, setTurnState] = useState<TurnState>('idle');
	const [messages, setMessages] = useState<ChatMessage[]>([]);
	const [interim, setInterim] = useState('');
	const [muted, setMuted] = useState(false);
	const [speakerOn, setSpeakerOn] = useState(true);
	const [micBlocked, setMicBlocked] = useState(false);
	const [showKeyboard, setShowKeyboard] = useState(false);
	const [showTranscript, setShowTranscript] = useState(false);
	const [textInput, setTextInput] = useState('');
	const [error, setError] = useState<CallError>(null);
	const [seconds, setSeconds] = useState(0);
	const [verifyResend, setVerifyResend] = useState<'idle' | 'sending' | 'sent' | 'failed'>('idle');
	const [recognitionSupported, setRecognitionSupported] = useState(false);

	const mountedRef = useRef(true);
	const recognitionRef = useRef<RecognizerHandle | null>(null);
	const abortRef = useRef<AbortController | null>(null);
	const ringTimerRef = useRef<number | null>(null);
	const transcriptEndRef = useRef<HTMLDivElement | null>(null);
	const stateRef = useRef({ phase, turnState, muted, speakerOn, micBlocked });
	stateRef.current = { phase, turnState, muted, speakerOn, micBlocked };

	useEffect(() => {
		const supported = isSpeechRecognitionSupported();
		setRecognitionSupported(supported);
		setShowKeyboard(!supported);
	}, []);

	const handleCallError = useCallback((err: unknown) => {
		if (err instanceof AssistantError) {
			if (err.status === 401) {
				navigate(`/auth?next=${encodeURIComponent(`/call/${scenario.id}`)}`);

				return;
			}

			if (err.status === 403) {
				setError({ kind: 'verify', message: err.message });

				return;
			}

			if (err.status === 429) {
				setError({ kind: 'rate', message: err.message });

				return;
			}
		}

		setError({
			kind: 'generic',
			message: err instanceof Error ? err.message : 'The call dropped. Try again.',
		});
	}, [navigate, scenario.id]);

	const startListening = useCallback(() => {
		const current = stateRef.current;

		if (
			current.phase !== 'active'
			|| current.muted
			|| current.micBlocked
			|| !isSpeechRecognitionSupported()
		) {
			return;
		}

		recognitionRef.current?.abort();

		const handle = createRecognizer({
			onInterim: text => setInterim(text),
			onFinal: (text) => {
				setInterim('');
				void sendTurnRef.current(text);
			},
			onError: (recognitionError) => {
				if (recognitionError === 'not-allowed' || recognitionError === 'service-not-allowed') {
					setMicBlocked(true);
					setShowKeyboard(true);
					setTurnState('idle');
				}
			},
			onEnd: () => {
				const latest = stateRef.current;

				if (
					latest.phase === 'active'
					&& latest.turnState === 'listening'
					&& !latest.muted
					&& !latest.micBlocked
				) {
					// The browser stops listening after a pause — reopen the mic.
					recognitionRef.current?.start();
				}
			},
		});

		if (!handle) {
			return;
		}

		recognitionRef.current = handle;
		setTurnState('listening');
		handle.start();
	}, []);

	const sendTurn = useCallback(async (rawText: string, options: { hidden?: boolean } = {}) => {
		const text = rawText.trim();

		if (stateRef.current.phase !== 'active') {
			return;
		}

		if (!text) {
			startListening();

			return;
		}

		recognitionRef.current?.abort();
		setInterim('');
		setError(null);
		setTurnState('thinking');

		if (!options.hidden) {
			setMessages(previous => [...previous, { role: 'user', content: text }]);
		}

		setMessages(previous => [...previous, { role: 'assistant', content: '' }]);

		const controller = new AbortController();
		abortRef.current = controller;

		try {
			const answer = await sendMessage({
				text,
				signal: controller.signal,
				onText: (chunk) => {
					setMessages((previous) => {
						const next = [...previous];
						const last = next[next.length - 1];

						if (last?.role === 'assistant') {
							next[next.length - 1] = { ...last, content: last.content + chunk };
						}

						return next;
					});
				},
			});

			if (!mountedRef.current || stateRef.current.phase !== 'active') {
				return;
			}

			if (stateRef.current.speakerOn && isSpeechSynthesisSupported()) {
				setTurnState('speaking');
				await speak(answer.content);

				if (!mountedRef.current || stateRef.current.phase !== 'active') {
					return;
				}
			}

			setTurnState('idle');
			startListening();
		} catch (err) {
			if (err instanceof DOMException && err.name === 'AbortError') {
				return;
			}

			if (!mountedRef.current) {
				return;
			}

			setMessages((previous) => {
				const next = [...previous];
				const last = next[next.length - 1];

				if (last?.role === 'assistant' && !last.content) {
					next.pop();
				}

				return next;
			});
			setTurnState('idle');
			handleCallError(err);
		}
	}, [handleCallError, startListening]);

	const sendTurnRef = useRef(sendTurn);
	sendTurnRef.current = sendTurn;

	const beginCall = useCallback(async () => {
		await clearChatHistory().catch(() => {});

		if (!mountedRef.current) {
			return;
		}

		await sendTurnRef.current(scenario.brief, { hidden: true });
	}, [scenario.brief]);

	const scheduleConnect = useCallback((delay: number) => {
		ringTimerRef.current = window.setTimeout(() => {
			if (!mountedRef.current) {
				return;
			}

			setPhase('active');
			void beginCall();
		}, delay);
	}, [beginCall]);

	useEffect(() => {
		mountedRef.current = true;
		pb.collection('users').authRefresh().catch(() => {});
		scheduleConnect(2200);

		return () => {
			mountedRef.current = false;

			if (ringTimerRef.current !== null) {
				window.clearTimeout(ringTimerRef.current);
			}

			abortRef.current?.abort();
			recognitionRef.current?.abort();
			stopSpeaking();
		};
	}, [scheduleConnect]);

	useEffect(() => {
		if (phase !== 'active') {
			return;
		}

		const interval = window.setInterval(() => setSeconds(value => value + 1), 1000);

		return () => window.clearInterval(interval);
	}, [phase]);

	useEffect(() => {
		transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
	}, [messages, interim, showTranscript]);

	const toggleMute = () => {
		const next = !muted;
		setMuted(next);
		stateRef.current.muted = next;

		if (next) {
			recognitionRef.current?.abort();
			setInterim('');

			if (stateRef.current.turnState === 'listening') {
				setTurnState('idle');
			}
		} else {
			startListening();
		}
	};

	const toggleSpeaker = () => {
		const next = !speakerOn;
		setSpeakerOn(next);
		stateRef.current.speakerOn = next;

		if (!next) {
			stopSpeaking();

			if (stateRef.current.turnState === 'speaking') {
				setTurnState('idle');
				startListening();
			}
		}
	};

	const endCall = () => {
		abortRef.current?.abort();
		recognitionRef.current?.abort();
		stopSpeaking();
		setInterim('');
		setTurnState('idle');
		setPhase('ended');
	};

	const callAgain = () => {
		setMessages([]);
		setSeconds(0);
		setError(null);
		setInterim('');
		setPhase('connecting');
		scheduleConnect(1600);
	};

	const submitText = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		const text = textInput.trim();

		if (!text) {
			return;
		}

		setTextInput('');
		void sendTurn(text);
	};

	const resendVerification = async () => {
		const email = pb.authStore.record?.email as string | undefined;

		if (!email) {
			return;
		}

		setVerifyResend('sending');

		try {
			await pb.collection('users').requestVerification(email);
			setVerifyResend('sent');
		} catch {
			setVerifyResend('failed');
		}
	};

	const retryAfterVerify = async () => {
		await pb.collection('users').authRefresh().catch(() => {});
		setError(null);

		if (messages.length === 0) {
			void sendTurn(scenario.brief, { hidden: true });
		} else {
			startListening();
		}
	};

	const lastAssistantMessage = [...messages].reverse().find(message => message.role === 'assistant');
	const exchanges = messages.filter(message => message.role === 'user').length;

	const statusText = (() => {
		if (phase === 'connecting') {
			return `Calling ${scenario.personaName}…`;
		}

		if (turnState === 'thinking') {
			return `${scenario.personaName} is thinking…`;
		}

		if (turnState === 'speaking') {
			return `${scenario.personaName} is speaking`;
		}

		if (turnState === 'listening') {
			return 'Listening — speak now';
		}

		if (micBlocked || !recognitionSupported) {
			return 'Voice input unavailable — type below';
		}

		return 'Your turn';
	})();

	const voiceActive = turnState === 'speaking' || turnState === 'listening';

	return (
		<div className="flex min-h-dvh flex-col bg-background">
			<header className="flex h-16 items-center justify-between gap-4 border-b border-border px-5">
				<Link
					to="/"
					className="flex items-center gap-2.5 font-mono text-xs tracking-widest text-muted-foreground uppercase transition-colors hover:text-primary"
				>
					<ArrowLeft className="h-4 w-4" />
					<img
						src="/logo-128.png"
						alt="RingReady Logo"
						className="h-6 w-6 rounded border border-primary/30 object-cover"
					/>
					<span className="hidden sm:inline">Leave call</span>
				</Link>
				<div className="text-center">
					<p className="font-display text-sm font-semibold tracking-tight">{scenario.title}</p>
					<p className="font-mono text-[11px] text-muted-foreground">{scenario.persona}</p>
				</div>
				<span className="font-mono text-sm text-primary tabular-nums">{formatDuration(seconds)}</span>
			</header>

			<div className="flex flex-1">
				{/* caption rail — scenario metadata */}
				<aside className="hidden w-60 shrink-0 flex-col gap-7 border-r border-border p-6 lg:flex">
					<div>
						<p className="font-mono text-[10px] tracking-[0.25em] text-muted-foreground uppercase">Scenario</p>
						<p className="mt-1.5 font-mono text-xs text-foreground">{scenario.index} — {scenario.title}</p>
					</div>
					<div>
						<p className="font-mono text-[10px] tracking-[0.25em] text-muted-foreground uppercase">Difficulty</p>
						<p className="mt-1.5 font-mono text-xs text-foreground">{scenario.difficulty} · {scenario.minutes}</p>
					</div>
					<div>
						<p className="font-mono text-[10px] tracking-[0.25em] text-muted-foreground uppercase">Your goal</p>
						<p className="mt-1.5 text-xs leading-relaxed text-foreground">{scenario.goal}</p>
					</div>
					<div>
						<p className="font-mono text-[10px] tracking-[0.25em] text-muted-foreground uppercase">Coach’s tip</p>
						<p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{scenario.tip}</p>
					</div>
				</aside>

				<main className="relative flex flex-1 flex-col items-center justify-center overflow-hidden px-5 py-10">
					<div aria-hidden className="absolute -top-24 -right-24 h-72 w-72 rotate-6 bg-accent/40" />

					{phase === 'ended' ? (
						<div className="relative w-full max-w-lg animate-fade-up">
							<div className="border border-primary/30 bg-card p-8 shadow-gold-deep">
								<p className="font-mono text-[11px] tracking-[0.3em] text-primary uppercase">Call ended</p>
								<h1 className="mt-4 font-display text-4xl font-bold tracking-tight">Nice reps.</h1>
								<div className="mt-6 grid grid-cols-2 gap-px border border-border bg-border">
									<div className="bg-background p-4">
										<p className="font-mono text-[10px] tracking-[0.25em] text-muted-foreground uppercase">Duration</p>
										<p className="mt-1 font-display text-2xl font-semibold tabular-nums">{formatDuration(seconds)}</p>
									</div>
									<div className="bg-background p-4">
										<p className="font-mono text-[10px] tracking-[0.25em] text-muted-foreground uppercase">Your turns</p>
										<p className="mt-1 font-display text-2xl font-semibold tabular-nums">{exchanges}</p>
									</div>
								</div>

								{messages.length > 0 ? (
									<div className="mt-6 max-h-56 overflow-y-auto border border-border bg-background p-4">
										{messages.map((message, index) => (
											<p key={index} className="mb-3 text-sm leading-relaxed last:mb-0">
												<span className="font-mono text-[10px] tracking-widest text-primary uppercase">
													{message.role === 'assistant' ? `${scenario.personaName}: ` : 'You: '}
												</span>
												<span className="text-muted-foreground">{message.content}</span>
											</p>
										))}
									</div>
								) : null}

								<div className="mt-8 flex flex-col gap-3 sm:flex-row">
									<button
										type="button"
										onClick={callAgain}
										className="flex h-12 flex-1 items-center justify-center gap-2 bg-primary font-mono text-sm font-semibold tracking-widest text-primary-foreground uppercase transition-transform hover:-translate-y-0.5 active:translate-y-0"
									>
										<RotateCcw className="h-4 w-4" />
										Call again
									</button>
									<Link
										to="/"
										className="flex h-12 flex-1 items-center justify-center border border-border font-mono text-sm tracking-widest uppercase transition-colors hover:border-primary hover:text-primary"
									>
										New scenario
									</Link>
								</div>
							</div>
						</div>
					) : (
						<div className="relative flex w-full max-w-xl flex-col items-center">
							{/* persona avatar with pulse rings */}
							<div className="relative">
								{voiceActive ? (
									<>
										<span aria-hidden className="absolute inset-0 rounded-full border border-primary animate-ring" />
										<span aria-hidden className="absolute inset-0 rounded-full border border-primary animate-ring [animation-delay:600ms]" />
									</>
								) : null}
								<span
									className={`relative flex h-28 w-28 items-center justify-center rounded-full font-display text-3xl font-bold transition-colors duration-300 ${
										turnState === 'speaking'
											? 'bg-primary text-primary-foreground'
											: 'bg-secondary text-primary'
									}`}
								>
									{initialsOf(scenario.personaName)}
								</span>
							</div>

							<p className="mt-6 font-mono text-xs tracking-[0.25em] text-muted-foreground uppercase">
								{statusText}
							</p>

							{/* waveform */}
							<div className="mt-6 flex h-10 items-center gap-1.5" aria-hidden>
								{WAVE_BARS.map((scale, index) => (
									<span
										key={index}
										className={`w-1 origin-bottom rounded-full ${
											voiceActive ? 'animate-wave bg-primary' : 'bg-border'
										}`}
										style={{
											height: `${scale * 2.5}rem`,
											animationDelay: `${index * 85}ms`,
										}}
									/>
								))}
							</div>

							{/* live caption */}
							<div className="mt-8 flex min-h-24 w-full items-center justify-center border border-border bg-card/70 px-6 py-5 text-center">
								{turnState === 'listening' && interim ? (
									<p className="font-display text-xl font-medium text-foreground">{interim}</p>
								) : lastAssistantMessage?.content ? (
									<p className="font-display text-xl leading-snug font-medium text-foreground text-balance">
										{lastAssistantMessage.content}
									</p>
								) : (
									<p className="text-sm text-muted-foreground">
										{phase === 'connecting' ? 'The line is ringing…' : 'Say hello to begin.'}
									</p>
								)}
							</div>

							{error ? (
								<div role="alert" className="mt-5 w-full border border-destructive/40 bg-destructive/10 px-5 py-4">
									<p className="text-sm text-destructive">{error.message}</p>
									{error.kind === 'verify' ? (
										<div className="mt-3 flex flex-wrap gap-2">
											<button
												type="button"
												onClick={retryAfterVerify}
												className="h-9 border border-primary px-4 font-mono text-xs tracking-widest text-primary uppercase transition-colors hover:bg-primary hover:text-primary-foreground"
											>
												I’ve verified — continue
											</button>
											<button
												type="button"
												onClick={resendVerification}
												disabled={verifyResend === 'sending'}
												className="h-9 border border-border px-4 font-mono text-xs tracking-widest text-muted-foreground uppercase transition-colors hover:border-primary hover:text-primary disabled:opacity-50"
											>
												{verifyResend === 'sending'
													? 'Sending…'
													: verifyResend === 'sent'
														? 'Link sent — check spam'
														: verifyResend === 'failed'
															? 'Try again'
															: 'Resend link'}
											</button>
										</div>
									) : (
										<button
											type="button"
											onClick={() => {
												setError(null);
												startListening();
											}}
											className="mt-3 h-9 border border-border px-4 font-mono text-xs tracking-widest text-muted-foreground uppercase transition-colors hover:border-primary hover:text-primary"
										>
											Resume call
										</button>
									)}
								</div>
							) : null}

							{showKeyboard ? (
								<form onSubmit={submitText} className="mt-5 flex w-full gap-2">
									<input
										type="text"
										value={textInput}
										onChange={event => setTextInput(event.target.value)}
										placeholder={
											recognitionSupported && !micBlocked
												? 'Type instead of speaking…'
												: 'Type your side of the call…'
										}
										className="h-12 flex-1 border border-input bg-background px-4 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none"
									/>
									<button
										type="submit"
										disabled={turnState === 'thinking' || turnState === 'speaking'}
										aria-label="Send"
										className="flex h-12 w-12 shrink-0 items-center justify-center bg-primary text-primary-foreground transition-transform hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50"
									>
										<Send className="h-4 w-4" />
									</button>
								</form>
							) : null}
						</div>
					)}
				</main>
			</div>

			{phase !== 'ended' ? (
				<div className="border-t border-border">
					{showTranscript ? (
						<div className="max-h-44 overflow-y-auto border-b border-border bg-card/60 px-5 py-4">
							{messages.length === 0 ? (
								<p className="text-center text-sm text-muted-foreground">The transcript appears here as you talk.</p>
							) : (
								messages.map((message, index) => (
									<p key={index} className="mx-auto mb-2.5 max-w-2xl text-sm leading-relaxed last:mb-0">
										<span className="font-mono text-[10px] tracking-widest text-primary uppercase">
											{message.role === 'assistant' ? `${scenario.personaName}: ` : 'You: '}
										</span>
										<span className="text-muted-foreground">{message.content || '…'}</span>
									</p>
								))
							)}
							<div ref={transcriptEndRef} />
						</div>
					) : null}

					<div className="flex items-center justify-center gap-3 px-5 py-5 sm:gap-4">
						<button
							type="button"
							onClick={toggleMute}
							disabled={!recognitionSupported || micBlocked}
							aria-label={muted ? 'Unmute microphone' : 'Mute microphone'}
							className={`flex h-12 w-12 items-center justify-center rounded-full border transition-colors disabled:opacity-40 ${
								muted
									? 'border-destructive/50 bg-destructive/15 text-destructive'
									: 'border-border text-foreground hover:border-primary hover:text-primary'
							}`}
						>
							{muted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
						</button>
						<button
							type="button"
							onClick={() => setShowKeyboard(value => !value)}
							aria-label="Toggle keyboard input"
							className={`flex h-12 w-12 items-center justify-center rounded-full border transition-colors ${
								showKeyboard
									? 'border-primary bg-primary/15 text-primary'
									: 'border-border text-foreground hover:border-primary hover:text-primary'
							}`}
						>
							<Keyboard className="h-5 w-5" />
						</button>
						<button
							type="button"
							onClick={endCall}
							aria-label="End call"
							className="flex h-14 w-14 items-center justify-center rounded-full border border-destructive/60 bg-destructive text-destructive-foreground shadow-gold transition-transform hover:-translate-y-0.5 active:translate-y-0"
						>
							<PhoneOff className="h-6 w-6" />
						</button>
						<button
							type="button"
							onClick={toggleSpeaker}
							aria-label={speakerOn ? 'Turn speaker off' : 'Turn speaker on'}
							className={`flex h-12 w-12 items-center justify-center rounded-full border transition-colors ${
								speakerOn
									? 'border-border text-foreground hover:border-primary hover:text-primary'
									: 'border-destructive/50 bg-destructive/15 text-destructive'
							}`}
						>
							{speakerOn ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}
						</button>
						<button
							type="button"
							onClick={() => setShowTranscript(value => !value)}
							aria-label="Toggle transcript"
							className={`flex h-12 w-12 items-center justify-center rounded-full border transition-colors ${
								showTranscript
									? 'border-primary bg-primary/15 text-primary'
									: 'border-border text-foreground hover:border-primary hover:text-primary'
							}`}
						>
							<ScrollText className="h-5 w-5" />
						</button>
					</div>
				</div>
			) : null}
		</div>
	);
}
