/**
 * Browser speech plumbing for practice calls: speech-to-text through the Web
 * Speech API and a human-sounding reply voice through SpeechSynthesis.
 * Everything is guarded so the module is safe to import during SSR.
 */

export type RecognizerHandle = {
	start: () => void;
	stop: () => void;
	abort: () => void;
};

export type RecognizerHandlers = {
	onFinal: (transcript: string) => void;
	onInterim?: (transcript: string) => void;
	onError?: (error: string) => void;
	onEnd?: () => void;
};

type RecognitionResultLike = { isFinal: boolean; 0: { transcript: string } };
type RecognitionEventLike = { resultIndex: number; results: ArrayLike<RecognitionResultLike> };

interface RecognitionInstance {
	lang: string;
	continuous: boolean;
	interimResults: boolean;
	maxAlternatives: number;
	onresult: ((event: RecognitionEventLike) => void) | null;
	onerror: ((event: { error?: string }) => void) | null;
	onend: (() => void) | null;
	start: () => void;
	stop: () => void;
	abort: () => void;
}

type RecognitionConstructor = new () => RecognitionInstance;

const recognitionConstructor = (): RecognitionConstructor | null => {
	if (typeof window === 'undefined') {
		return null;
	}

	const w = window as unknown as {
		SpeechRecognition?: RecognitionConstructor;
		webkitSpeechRecognition?: RecognitionConstructor;
	};

	return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
};

export const isSpeechRecognitionSupported = (): boolean => recognitionConstructor() !== null;

export const isSpeechSynthesisSupported = (): boolean =>
	typeof window !== 'undefined' && 'speechSynthesis' in window;

export function createRecognizer(handlers: RecognizerHandlers): RecognizerHandle | null {
	const Ctor = recognitionConstructor();

	if (!Ctor) {
		return null;
	}

	let recognition: RecognitionInstance | null = null;
	let isRunning = false;
	let isManualStop = false;

	const init = () => {
		try {
			recognition = new Ctor();
			recognition.lang = 'en-US';
			recognition.continuous = true;
			recognition.interimResults = true;
			recognition.maxAlternatives = 1;

			recognition.onresult = (event) => {
				let interim = '';

				for (let i = event.resultIndex; i < event.results.length; i += 1) {
					const result = event.results[i];

					if (result.isFinal) {
						handlers.onFinal(result[0].transcript);
					} else {
						interim += result[0].transcript;
					}
				}

				if (interim) {
					handlers.onInterim?.(interim);
				}
			};

			recognition.onerror = (event) => {
				const err = event.error ?? 'unknown';
				// 'no-speech' happens when user is quiet; safe to ignore
				if (err === 'no-speech' || err === 'aborted') {
					return;
				}
				handlers.onError?.(err);
			};

			recognition.onend = () => {
				isRunning = false;
				if (!isManualStop) {
					handlers.onEnd?.();
				}
			};
		} catch {
			recognition = null;
		}
	};

	init();

	return {
		start: () => {
			isManualStop = false;
			if (!recognition) {
				init();
			}
			if (!recognition || isRunning) return;
			try {
				isRunning = true;
				recognition.start();
			} catch {
				isRunning = false;
				// If start threw because instance was already used/ended, recreate and start
				init();
				try {
					isRunning = true;
					recognition?.start();
				} catch {
					isRunning = false;
				}
			}
		},
		stop: () => {
			isManualStop = true;
			isRunning = false;
			try {
				recognition?.stop();
			} catch {}
		},
		abort: () => {
			isManualStop = true;
			isRunning = false;
			try {
				recognition?.abort();
			} catch {}
		},
	};
}

/** Voices that sound the most human, in the order we prefer them. */
const PREFERRED_VOICE_PATTERNS = [
	/google us english/i,
	/microsoft .*online \(natural\).*english/i,
	/microsoft (aria|jenny|guy|sara)/i,
	/samantha/i,
	/zira/i,
	/google uk english female/i,
];

const FEMALE_VOICE_PATTERNS = [
	/microsoft (aria|jenny|michelle|zira|susan|hazel|sara)/i,
	/google uk english female/i,
	/google .*female/i,
	/samantha/i,
	/victoria/i,
	/karen/i,
	/fiona/i,
	/serena/i,
];

const MALE_VOICE_PATTERNS = [
	/microsoft (david|guy|mark|george|richard|ryan)/i,
	/google uk english male/i,
	/google .*male/i,
	/alex/i,
	/daniel/i,
	/fred/i,
	/oliver/i,
	/tom/i,
];

let voicesCache: SpeechSynthesisVoice[] = [];

const refreshVoices = () => {
	if (!isSpeechSynthesisSupported()) {
		return;
	}

	voicesCache = window.speechSynthesis.getVoices();
};

if (isSpeechSynthesisSupported()) {
	refreshVoices();
	window.speechSynthesis.addEventListener('voiceschanged', refreshVoices);
}

export const pickVoice = (gender?: 'male' | 'female' | 'neutral'): SpeechSynthesisVoice | null => {
	if (voicesCache.length === 0) {
		refreshVoices();
	}

	const english = voicesCache.filter(voice => voice.lang.toLowerCase().startsWith('en'));

	if (gender === 'female') {
		for (const pattern of FEMALE_VOICE_PATTERNS) {
			const match = english.find(voice => pattern.test(voice.name));
			if (match) return match;
		}
	} else if (gender === 'male') {
		for (const pattern of MALE_VOICE_PATTERNS) {
			const match = english.find(voice => pattern.test(voice.name));
			if (match) return match;
		}
	}

	for (const pattern of PREFERRED_VOICE_PATTERNS) {
		const match = english.find(voice => pattern.test(voice.name));

		if (match) {
			return match;
		}
	}

	return english.find(voice => voice.lang === 'en-US') ?? english[0] ?? null;
};

// Global pin to prevent garbage collection of active speech utterance mid-phrase
let activeUtterance: SpeechSynthesisUtterance | null = null;
let activeUtteranceTimer: number | null = null;
let activeResumeInterval: number | null = null;

export const unlockAudio = (): void => {
	if (isSpeechSynthesisSupported()) {
		try {
			window.speechSynthesis.resume();
		} catch {}
	}
};

/** Speaks one reply aloud; resolves when the voice finishes (or safety timeout elapses). */
export function speak(
	text: string,
	options: { rate?: number; pitch?: number; gender?: 'male' | 'female' | 'neutral' } = {}
): Promise<void> {
	return new Promise((resolve) => {
		if (!isSpeechSynthesisSupported() || !text.trim()) {
			resolve();
			return;
		}

		const synth = window.speechSynthesis;

		if (activeUtteranceTimer !== null) {
			window.clearTimeout(activeUtteranceTimer);
			activeUtteranceTimer = null;
		}
		if (activeResumeInterval !== null) {
			window.clearInterval(activeResumeInterval);
			activeResumeInterval = null;
		}

		try {
			synth.cancel();
		} catch {}

		let settled = false;
		const finish = () => {
			if (settled) return;
			settled = true;
			if (activeUtteranceTimer !== null) {
				window.clearTimeout(activeUtteranceTimer);
				activeUtteranceTimer = null;
			}
			if (activeResumeInterval !== null) {
				window.clearInterval(activeResumeInterval);
				activeResumeInterval = null;
			}
			activeUtterance = null;
			resolve();
		};

		const utterance = new SpeechSynthesisUtterance(text);
		activeUtterance = utterance;

		const voice = pickVoice(options.gender);
		if (voice) {
			utterance.voice = voice;
		}

		const rate = options.rate ?? 1.02;
		utterance.rate = rate;
		utterance.pitch = options.pitch ?? 1;

		utterance.onend = () => finish();
		utterance.onerror = () => finish();

		// Safety timeout: ensure call state never hangs even if browser drops onend or autoplay blocked
		const words = text.trim().split(/\s+/).length;
		const maxDurationMs = Math.max(3000, Math.min(18000, (words / (rate * 2.2)) * 1000 + 2500));
		activeUtteranceTimer = window.setTimeout(() => {
			finish();
		}, maxDurationMs);

		// Chrome bug workaround: periodic resume every 5s while speaking
		activeResumeInterval = window.setInterval(() => {
			if (synth.speaking && synth.paused) {
				try {
					synth.resume();
				} catch {}
			}
		}, 5000);

		try {
			synth.speak(utterance);
			if (synth.paused) {
				synth.resume();
			}
		} catch {
			finish();
		}
	});
}

export const stopSpeaking = (): void => {
	if (isSpeechSynthesisSupported()) {
		if (activeUtteranceTimer !== null) {
			window.clearTimeout(activeUtteranceTimer);
			activeUtteranceTimer = null;
		}
		if (activeResumeInterval !== null) {
			window.clearInterval(activeResumeInterval);
			activeResumeInterval = null;
		}
		activeUtterance = null;
		window.speechSynthesis.cancel();
	}
};
