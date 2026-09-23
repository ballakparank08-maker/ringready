/**
 * Audio recording helper using MediaRecorder for Call Studio.
 * Handles microphone capture, chunk aggregation, audio blob creation,
 * and audio level metering.
 */

export interface RecordingResult {
	blob: Blob;
	url: string;
	duration: number;
	mimeType: string;
}

export interface AudioRecorderController {
	start: () => Promise<void>;
	stop: () => Promise<RecordingResult | null>;
	pause: () => void;
	resume: () => void;
	isRecording: () => boolean;
	isPaused: () => boolean;
	getDuration: () => number;
	getAudioLevel: () => number;
	cleanup: () => void;
}

export function isAudioRecordingSupported(): boolean {
	return (
		typeof window !== 'undefined' &&
		typeof navigator !== 'undefined' &&
		Boolean(navigator.mediaDevices?.getUserMedia) &&
		typeof window.MediaRecorder !== 'undefined'
	);
}

export function getSupportedMimeType(): string {
	if (typeof window === 'undefined' || typeof MediaRecorder === 'undefined') {
		return '';
	}

	const types = [
		'audio/webm;codecs=opus',
		'audio/webm',
		'audio/ogg;codecs=opus',
		'audio/mp4',
		'audio/aac',
	];

	for (const type of types) {
		if (MediaRecorder.isTypeSupported(type)) {
			return type;
		}
	}

	return '';
}

export function createAudioRecorder(options?: {
	onTick?: (seconds: number) => void;
	onLevel?: (level: number) => void;
}): AudioRecorderController {
	let stream: MediaStream | null = null;
	let mediaRecorder: MediaRecorder | null = null;
	let chunks: Blob[] = [];
	let startTime = 0;
	let elapsedBeforePause = 0;
	let timerId: number | null = null;
	let animFrameId: number | null = null;
	let audioContext: AudioContext | null = null;
	let analyser: AnalyserNode | null = null;
	let currentAudioLevel = 0;
	let isPausedState = false;
	let isRecordingState = false;

	const mimeType = getSupportedMimeType();

	const updateDuration = () => {
		if (!isRecordingState || isPausedState) return;
		const totalSeconds = Math.floor(
			(performance.now() - startTime + elapsedBeforePause) / 1000
		);
		options?.onTick?.(totalSeconds);
	};

	const meterAudio = () => {
		if (!analyser || !isRecordingState || isPausedState) {
			currentAudioLevel = 0;
			options?.onLevel?.(0);
			return;
		}

		const dataArray = new Uint8Array(analyser.frequencyBinCount);
		analyser.getByteFrequencyData(dataArray);

		let sum = 0;
		for (let i = 0; i < dataArray.length; i++) {
			sum += dataArray[i];
		}
		const average = sum / dataArray.length;
		currentAudioLevel = Math.min(1, average / 128);
		options?.onLevel?.(currentAudioLevel);

		animFrameId = requestAnimationFrame(meterAudio);
	};

	const cleanup = () => {
		if (timerId !== null) {
			clearInterval(timerId);
			timerId = null;
		}
		if (animFrameId !== null) {
			cancelAnimationFrame(animFrameId);
			animFrameId = null;
		}
		if (audioContext && audioContext.state !== 'closed') {
			try {
				void audioContext.close();
			} catch {
				// Ignore
			}
			audioContext = null;
		}
		if (stream) {
			stream.getTracks().forEach((track) => track.stop());
			stream = null;
		}
		mediaRecorder = null;
		analyser = null;
		isRecordingState = false;
		isPausedState = false;
	};

	const start = async () => {
		cleanup();
		chunks = [];
		elapsedBeforePause = 0;

		stream = await navigator.mediaDevices.getUserMedia({
			audio: {
				echoCancellation: true,
				noiseSuppression: true,
				autoGainControl: true,
			},
		});

		try {
			const AudioContextClass =
				window.AudioContext ||
				(window as unknown as { webkitAudioContext: typeof AudioContext })
					.webkitAudioContext;
			if (AudioContextClass) {
				audioContext = new AudioContextClass();
				const source = audioContext.createMediaStreamSource(stream);
				analyser = audioContext.createAnalyser();
				analyser.fftSize = 64;
				analyser.smoothingTimeConstant = 0.8;
				source.connect(analyser);
			}
		} catch {
			// Web Audio metering optional
		}

		const recorderOptions: MediaRecorderOptions = {};
		if (mimeType) {
			recorderOptions.mimeType = mimeType;
		}

		mediaRecorder = new MediaRecorder(stream, recorderOptions);

		mediaRecorder.ondataavailable = (event) => {
			if (event.data && event.data.size > 0) {
				chunks.push(event.data);
			}
		};

		mediaRecorder.start(250); // collect in 250ms chunks
		startTime = performance.now();
		isRecordingState = true;
		isPausedState = false;

		timerId = window.setInterval(updateDuration, 1000);
		if (analyser) {
			meterAudio();
		}
	};

	const pause = () => {
		if (mediaRecorder && mediaRecorder.state === 'recording') {
			mediaRecorder.pause();
			isPausedState = true;
			elapsedBeforePause += performance.now() - startTime;
		}
	};

	const resume = () => {
		if (mediaRecorder && mediaRecorder.state === 'paused') {
			mediaRecorder.resume();
			isPausedState = false;
			startTime = performance.now();
			if (analyser) {
				meterAudio();
			}
		}
	};

	const stop = (): Promise<RecordingResult | null> => {
		return new Promise((resolve) => {
			if (!mediaRecorder || mediaRecorder.state === 'inactive') {
				cleanup();
				resolve(null);
				return;
			}

			const finalDuration = Math.round(
				(performance.now() - startTime + elapsedBeforePause) / 1000
			);

			mediaRecorder.onstop = () => {
				const recordedMimeType = mediaRecorder?.mimeType || mimeType || 'audio/webm';
				const blob = new Blob(chunks, { type: recordedMimeType });
				const url = URL.createObjectURL(blob);

				cleanup();
				resolve({
					blob,
					url,
					duration: finalDuration,
					mimeType: recordedMimeType,
				});
			};

			mediaRecorder.stop();
		});
	};

	const getDuration = () => {
		if (!isRecordingState) return 0;
		if (isPausedState) return Math.floor(elapsedBeforePause / 1000);
		return Math.floor((performance.now() - startTime + elapsedBeforePause) / 1000);
	};

	return {
		start,
		stop,
		pause,
		resume,
		isRecording: () => isRecordingState,
		isPaused: () => isPausedState,
		getDuration,
		getAudioLevel: () => currentAudioLevel,
		cleanup,
	};
}
