import { useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import {
	ArrowLeft,
	Keyboard,
	Mic,
	MicOff,
	Phone,
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
import { CALLER_VOICES, getCallerVoiceByName } from '@/data/voices';
import type { CallerVoiceProfile } from '@/data/voices';
import pb from '@/lib/pocketbase-client';
import {
	createRecognizer,
	isSpeechRecognitionSupported,
	isSpeechSynthesisSupported,
	pickVoice,
	speak,
	stopSpeaking,
	unlockAudio,
} from '@/lib/speech';
import type { RecognizerHandle } from '@/lib/speech';
import { CallEvaluationView } from './call-evaluation-view';
import { createAudioRecorder, isAudioRecordingSupported } from '@/lib/audio-recorder';
import type { AudioRecorderController, RecordingResult } from '@/lib/audio-recorder';

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

	const [recordingResult, setRecordingResult] = useState<RecordingResult | null>(null);
	const [isRecording, setIsRecording] = useState(false);
	const [recordingSeconds, setRecordingSeconds] = useState(0);
	const [recordingAudioLevel, setRecordingAudioLevel] = useState(0);

	const [activeVoice, setActiveVoice] = useState<CallerVoiceProfile>(() =>
		getCallerVoiceByName(scenario.personaName)
	);
	const activeVoiceRef = useRef(activeVoice);
	activeVoiceRef.current = activeVoice;

	const mountedRef = useRef(true);
	const recognitionRef = useRef<RecognizerHandle | null>(null);
	const abortRef = useRef<AbortController | null>(null);
	const ringTimerRef = useRef<number | null>(null);
	const transcriptEndRef = useRef<HTMLDivElement | null>(null);
	const recorderRef = useRef<AudioRecorderController | null>(null);
	const stateRef = useRef({ phase, turnState, muted, speakerOn, micBlocked });
	stateRef.current = { phase, turnState, muted, speakerOn, micBlocked };

	useEffect(() => {
		const supported = isSpeechRecognitionSupported();
		setRecognitionSupported(supported);
		setShowKeyboard(true);
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

		unlockAudio();
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
				} else {
					// Benign error (like no-speech pause): cleanly restart listening
					window.setTimeout(() => {
						if (
							stateRef.current.phase === 'active'
							&& stateRef.current.turnState === 'listening'
							&& !stateRef.current.muted
							&& !stateRef.current.micBlocked
						) {
							startListening();
						}
					}, 250);
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
					// Reopen mic using fresh recognition session
					window.setTimeout(() => {
						if (
							stateRef.current.phase === 'active'
							&& stateRef.current.turnState === 'listening'
							&& !stateRef.current.muted
						) {
							startListening();
						}
					}, 150);
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

		stopSpeaking();
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
				await speak(answer.content, {
					pitch: activeVoiceRef.current.pitch,
					rate: activeVoiceRef.current.rate,
					gender: activeVoiceRef.current.gender,
				});

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
		unlockAudio();
		stopSpeaking();
		await clearChatHistory().catch(() => {});

		if (!mountedRef.current) {
			return;
		}

		await sendTurnRef.current(scenario.brief, { hidden: true });
	}, [scenario.brief]);

	const startRecording = useCallback(async () => {
		if (!isAudioRecordingSupported()) return;
		try {
			recorderRef.current?.cleanup();
			const rec = createAudioRecorder({
				onTick: (sec) => setRecordingSeconds(sec),
				onLevel: (lvl) => setRecordingAudioLevel(lvl),
			});
			recorderRef.current = rec;
			await rec.start();
			setIsRecording(true);
		} catch (err) {
			console.warn('Audio recording failed to start:', err);
			setIsRecording(false);
		}
	}, []);

	const toggleRecording = useCallback(() => {
		if (!recorderRef.current) return;
		if (recorderRef.current.isPaused()) {
			recorderRef.current.resume();
			setIsRecording(true);
		} else if (recorderRef.current.isRecording()) {
			recorderRef.current.pause();
			setIsRecording(false);
		}
	}, []);

	const connectCall = useCallback(() => {
		if (ringTimerRef.current !== null) {
			window.clearTimeout(ringTimerRef.current);
			ringTimerRef.current = null;
		}
		unlockAudio();
		setPhase('active');
		void beginCall();
	}, [beginCall]);

	const scheduleConnect = useCallback((delay: number) => {
		ringTimerRef.current = window.setTimeout(() => {
			if (!mountedRef.current) {
				return;
			}
			connectCall();
		}, delay);
	}, [connectCall]);

	useEffect(() => {
		if (phase === 'active') {
			void startRecording();
		}
	}, [phase, startRecording]);

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
			recorderRef.current?.cleanup();
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
		if (micBlocked) {
			setMicBlocked(false);
			stateRef.current.micBlocked = false;
			startListening();
			return;
		}
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

	const endCall = async () => {
		abortRef.current?.abort();
		recognitionRef.current?.abort();
		stopSpeaking();
		setInterim('');
		setTurnState('idle');

		let recResult: RecordingResult | null = null;
		if (recorderRef.current) {
			try {
				recResult = await recorderRef.current.stop();
			} catch (e) {
				console.error('Failed to stop recording:', e);
			}
		}
		setRecordingResult(recResult);
		setIsRecording(false);
		setPhase('ended');
	};

	const callAgain = () => {
		if (recordingResult?.url) {
			URL.revokeObjectURL(recordingResult.url);
		}
		setRecordingResult(null);
		setIsRecording(false);
		setRecordingSeconds(0);
		setRecordingAudioLevel(0);
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
			return `${activeVoice.name} is thinking…`;
		}

		if (turnState === 'speaking') {
			return `${activeVoice.name} is speaking`;
		}

		if (turnState === 'listening') {
			return interim ? `Hearing: "${interim}"` : 'Listening — speak into your microphone';
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
				<div className="flex items-center gap-3">
					{phase === 'active' ? (
						<button
							type="button"
							onClick={toggleRecording}
							title={isRecording ? 'Click to pause audio recording' : 'Click to resume audio recording'}
							className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[11px] tracking-wider transition-colors ${
								isRecording
									? 'border-red-500/50 bg-red-500/10 text-red-400 hover:bg-red-500/20'
									: 'border-border bg-card text-muted-foreground hover:text-foreground'
							}`}
						>
							<span className="relative flex h-2 w-2">
								{isRecording ? (
									<>
										<span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
										<span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
									</>
								) : (
									<span className="h-2 w-2 rounded-full bg-muted-foreground" />
								)}
							</span>
							<span className="font-semibold uppercase">{isRecording ? 'REC' : 'PAUSED'}</span>
							<span className="tabular-nums">{formatDuration(recordingSeconds)}</span>
						</button>
					) : null}
					<span className="font-mono text-sm text-primary tabular-nums">{formatDuration(seconds)}</span>
				</div>
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
					<div>
						<p className="font-mono text-[10px] tracking-[0.25em] text-muted-foreground uppercase">AI Caller Voices (4)</p>
						<div className="mt-2.5 space-y-2">
							{CALLER_VOICES.map((v) => {
								const isSelected = v.id === activeVoice.id;
								return (
									<button
										key={v.id}
										type="button"
										onClick={() => {
											setActiveVoice(v);
											if (v.id === 'marcus-vance' && scenario.id !== 'identity-theft-marcus') {
												navigate('/call/identity-theft-marcus');
											} else if (v.id === 'elena-rodriguez' && scenario.id !== 'identity-theft-elena') {
												navigate('/call/identity-theft-elena');
											} else if (v.id === 'brenda-kowalski' && scenario.id !== 'identity-theft-brenda') {
												navigate('/call/identity-theft-brenda');
											} else if (v.id === 'jordan-hale' && scenario.id !== 'identity-theft-intake' && scenario.id !== 'identity-theft-deepening') {
												navigate('/call/identity-theft-intake');
											}
										}}
										className={`w-full rounded border p-2 text-left transition-all ${
											isSelected
												? 'border-primary bg-primary/10 text-foreground ring-1 ring-primary/40'
												: 'border-border bg-card/40 text-muted-foreground hover:border-border/80 hover:text-foreground'
										}`}
									>
										<div className="flex items-center justify-between">
											<span className="font-display text-xs font-semibold">{v.name}</span>
											<span className={`rounded-full border px-1.5 py-0.5 font-mono text-[9px] uppercase ${v.badgeClass}`}>
												{v.gender}
											</span>
										</div>
										<p className="mt-1 font-mono text-[10px] text-muted-foreground">{v.style}</p>
									</button>
								);
							})}
						</div>
					</div>
				</aside>

				<main className="relative flex flex-1 flex-col items-center justify-center overflow-hidden px-5 py-10">
					<div aria-hidden className="absolute -top-24 -right-24 h-72 w-72 rotate-6 bg-accent/40" />

					{phase === 'ended' ? (
						<CallEvaluationView
							scenario={scenario}
							messages={messages}
							durationSeconds={seconds}
							recordingResult={recordingResult}
							onCallAgain={callAgain}
						/>
					) : (
						<div className="relative flex w-full max-w-xl flex-col items-center">
							{/* AI Voice & Persona Bar */}
							<div className="mb-6 flex flex-col items-center gap-2">
								<div className="flex flex-wrap items-center justify-center gap-1.5 sm:gap-2">
									<span className="mr-0.5 font-mono text-[10px] tracking-widest text-muted-foreground uppercase">
										AI Voice:
									</span>
									{CALLER_VOICES.map((v) => {
										const isCurrent = v.id === activeVoice.id;
										return (
											<button
												key={v.id}
												type="button"
												onClick={() => {
													setActiveVoice(v);
													if (v.id === 'marcus-vance' && scenario.id !== 'identity-theft-marcus') {
														navigate('/call/identity-theft-marcus');
													} else if (v.id === 'elena-rodriguez' && scenario.id !== 'identity-theft-elena') {
														navigate('/call/identity-theft-elena');
													} else if (v.id === 'brenda-kowalski' && scenario.id !== 'identity-theft-brenda') {
														navigate('/call/identity-theft-brenda');
													} else if (v.id === 'jordan-hale' && scenario.id !== 'identity-theft-intake' && scenario.id !== 'identity-theft-deepening') {
														navigate('/call/identity-theft-intake');
													}
												}}
												title={`${v.name} (${v.gender}) — ${v.style}: ${v.description}`}
												className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[11px] tracking-wider transition-all ${
													isCurrent
														? `${v.badgeClass} ring-1 ring-primary/80 font-bold shadow-sm`
														: 'border-border bg-card/60 text-muted-foreground hover:border-primary/50 hover:text-foreground'
												}`}
											>
												<span className="h-1.5 w-1.5 rounded-full bg-current" />
												<span>{v.name}</span>
												<span className="text-[9px] uppercase opacity-75">({v.gender})</span>
											</button>
										);
									})}
								</div>
								<div className="flex flex-wrap items-center justify-center gap-2 font-mono text-[11px] text-muted-foreground">
									<span>Delivery: <strong className="font-semibold text-foreground">{activeVoice.style}</strong></span>
									<span className="hidden sm:inline">·</span>
									<span className="hidden sm:inline">{activeVoice.tagline}</span>
								</div>
							</div>

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
											? 'bg-primary text-primary-foreground shadow-gold'
											: 'bg-secondary text-primary'
									}`}
								>
									{activeVoice.avatarInitial || initialsOf(activeVoice.name)}
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
									<div className="flex flex-col items-center gap-2">
										<span className="font-mono text-[10px] tracking-widest text-primary uppercase animate-pulse">
											● Hearing your voice…
										</span>
										<p className="font-display text-xl font-medium text-foreground">{interim}</p>
										<button
											type="button"
											onClick={() => {
												recognitionRef.current?.stop();
											}}
											className="mt-1 inline-flex items-center gap-1.5 rounded-full border border-primary/50 bg-primary/20 px-3.5 py-1 font-mono text-[11px] font-semibold text-primary transition-colors hover:bg-primary hover:text-primary-foreground"
										>
											<Send className="h-3 w-3" />
											Done Speaking (Send)
										</button>
									</div>
								) : turnState === 'thinking' ? (
									<div className="flex flex-col items-center gap-2 py-2">
										<span className="font-mono text-xs tracking-widest text-primary uppercase animate-pulse">
											● {activeVoice.name} is answering…
										</span>
										{lastAssistantMessage?.content ? (
											<p className="font-display text-xl leading-snug font-medium text-foreground text-balance">
												{lastAssistantMessage.content}
											</p>
										) : null}
									</div>
								) : lastAssistantMessage?.content ? (
									<div className="flex flex-col items-center gap-1.5">
										{turnState === 'speaking' ? (
											<span className="font-mono text-[10px] tracking-widest text-primary uppercase animate-pulse">
												● {activeVoice.name} speaking…
											</span>
										) : null}
										<p className="font-display text-xl leading-snug font-medium text-foreground text-balance">
											{lastAssistantMessage.content}
										</p>
									</div>
								) : phase === 'connecting' ? (
									<div className="flex flex-col items-center gap-3 py-1">
										<p className="font-mono text-xs tracking-wider text-muted-foreground uppercase animate-pulse">
											Incoming Call…
										</p>
										<button
											type="button"
											onClick={connectCall}
											className="inline-flex items-center gap-2 rounded-full border border-primary bg-primary px-5 py-2 font-mono text-xs font-semibold tracking-wider text-primary-foreground uppercase shadow-gold transition-all hover:scale-105 active:scale-95"
										>
											<Phone className="h-3.5 w-3.5" />
											Tap to Answer / Speak
										</button>
									</div>
								) : (
									<p className="text-sm text-muted-foreground">
										Say hello to begin or speak into your microphone.
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
										disabled={turnState === 'thinking'}
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
											{message.role === 'assistant' ? `${activeVoice.name}: ` : 'You: '}
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
