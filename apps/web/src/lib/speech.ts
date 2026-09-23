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

	const recognition = new Ctor();
	recognition.lang = 'en-US';
	recognition.continuous = false;
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

	recognition.onerror = event => handlers.onError?.(event.error ?? 'unknown');
	recognition.onend = () => handlers.onEnd?.();

	return {
		start: () => {
			try {
				recognition.start();
			} catch {
				// Already started — safe to ignore.
			}
		},
		stop: () => recognition.stop(),
		abort: () => recognition.abort(),
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

export const pickVoice = (): SpeechSynthesisVoice | null => {
	if (voicesCache.length === 0) {
		refreshVoices();
	}

	const english = voicesCache.filter(voice => voice.lang.toLowerCase().startsWith('en'));

	for (const pattern of PREFERRED_VOICE_PATTERNS) {
		const match = english.find(voice => pattern.test(voice.name));

		if (match) {
			return match;
		}
	}

	return english.find(voice => voice.lang === 'en-US') ?? english[0] ?? null;
};

/** Speaks one reply aloud; resolves when the voice finishes (or fails). */
export function speak(text: string, options: { rate?: number; pitch?: number } = {}): Promise<void> {
	return new Promise((resolve) => {
		if (!isSpeechSynthesisSupported() || !text.trim()) {
			resolve();

			return;
		}

		const synth = window.speechSynthesis;
		synth.cancel();

		const utterance = new SpeechSynthesisUtterance(text);
		const voice = pickVoice();

		if (voice) {
			utterance.voice = voice;
		}

		utterance.rate = options.rate ?? 1.02;
		utterance.pitch = options.pitch ?? 1;
		utterance.onend = () => resolve();
		utterance.onerror = () => resolve();

		synth.speak(utterance);
	});
}

export const stopSpeaking = (): void => {
	if (isSpeechSynthesisSupported()) {
		window.speechSynthesis.cancel();
	}
};
