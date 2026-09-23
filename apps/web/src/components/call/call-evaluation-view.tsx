import { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router';
import {
	Award,
	CheckCircle2,
	XCircle,
	Play,
	Pause,
	Download,
	Copy,
	Check,
	RotateCcw,
	ArrowLeft,
	FileText,
	Sparkles,
	Volume2,
	ChevronDown,
	ChevronUp,
	ShieldCheck,
	Radio,
} from 'lucide-react';
import type { Scenario } from '@/data/scenarios';
import type { RecordingResult } from '@/lib/audio-recorder';
import { evaluateCallSession } from '@/lib/call-evaluation';
import type { ChatMessage } from '@/api/integrated-ai-api';

interface CallEvaluationViewProps {
	scenario: Scenario;
	messages: ChatMessage[];
	durationSeconds: number;
	recordingResult: RecordingResult | null;
	onCallAgain: () => void;
}

const formatTime = (totalSeconds: number): string => {
	const minutes = Math.floor(totalSeconds / 60);
	const seconds = Math.floor(totalSeconds % 60);
	return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};

export function CallEvaluationView({
	scenario,
	messages,
	durationSeconds,
	recordingResult,
	onCallAgain,
}: CallEvaluationViewProps) {
	const [activeTab, setActiveTab] = useState<'scorecard' | 'checklist' | 'transcript'>('scorecard');
	const [copied, setCopied] = useState(false);
	const [isPlayingAudio, setIsPlayingAudio] = useState(false);
	const [audioCurrentTime, setAudioCurrentTime] = useState(0);
	const [audioDuration, setAudioDuration] = useState(0);
	const [playbackRate, setPlaybackRate] = useState(1);
	const [expandedTurns, setExpandedTurns] = useState<Record<number, boolean>>({});

	const audioRef = useRef<HTMLAudioElement | null>(null);

	// Run evaluation on session messages
	const report = evaluateCallSession(scenario.id, messages);

	useEffect(() => {
		const audio = audioRef.current;
		if (!audio) return;

		const handleTimeUpdate = () => setAudioCurrentTime(audio.currentTime);
		const handleLoadedMetadata = () => {
			if (audio.duration && !Number.isNaN(audio.duration) && Number.isFinite(audio.duration)) {
				setAudioDuration(audio.duration);
			} else if (recordingResult?.duration) {
				setAudioDuration(recordingResult.duration);
			}
		};
		const handleEnded = () => {
			setIsPlayingAudio(false);
			setAudioCurrentTime(0);
		};

		audio.addEventListener('timeupdate', handleTimeUpdate);
		audio.addEventListener('loadedmetadata', handleLoadedMetadata);
		audio.addEventListener('ended', handleEnded);

		return () => {
			audio.removeEventListener('timeupdate', handleTimeUpdate);
			audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
			audio.removeEventListener('ended', handleEnded);
		};
	}, [recordingResult]);

	const togglePlayAudio = () => {
		const audio = audioRef.current;
		if (!audio) return;

		if (isPlayingAudio) {
			audio.pause();
			setIsPlayingAudio(false);
		} else {
			void audio.play();
			setIsPlayingAudio(true);
		}
	};

	const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
		const targetTime = Number(e.target.value);
		const audio = audioRef.current;
		if (audio) {
			audio.currentTime = targetTime;
			setAudioCurrentTime(targetTime);
		}
	};

	const handlePlaybackRateChange = (speed: number) => {
		setPlaybackRate(speed);
		if (audioRef.current) {
			audioRef.current.playbackRate = speed;
		}
	};

	const copyEvaluationReport = () => {
		const lines = [
			`# NYPD Studio Evaluation Report — ${scenario.title}`,
			`Officer: Officer TM`,
			`Overall Score: ${report.overallScore}% (Grade: ${report.letterGrade})`,
			`Call Duration: ${formatTime(durationSeconds)}`,
			`Total Turns: ${report.totalExchanges}`,
			`Checkpoints Completed: ${report.completedCount} / ${report.totalCriteria}`,
			``,
			`## Category Scores:`,
			...report.categories.map((c) => `- ${c.category}: ${c.score}/${c.max} (${c.percentage}%)`),
			``,
			`## Key Strengths:`,
			...report.strengths.map((s) => `- ${s}`),
			``,
			`## Areas for Improvement:`,
			...report.recommendations.map((r) => `- ${r}`),
			``,
			`## Checklist Breakdown:`,
			...report.criteria.map(
				(c) =>
					`- [${c.completed ? 'X' : ' '}] ${c.label} (${c.category})${
						c.evidence ? ` -> Evidence: "${c.evidence}"` : ''
					}`
			),
		];

		void navigator.clipboard.writeText(lines.join('\n'));
		setCopied(true);
		setTimeout(() => setCopied(false), 2500);
	};

	const downloadReportMarkdown = () => {
		const lines = [
			`# NYPD Studio Evaluation Report — ${scenario.title}`,
			`Officer: Officer TM`,
			`Overall Score: ${report.overallScore}% (Grade: ${report.letterGrade})`,
			`Evaluation Comment: ${report.gradeComment}`,
			`Call Duration: ${formatTime(durationSeconds)}`,
			`Total Exchanges: ${report.totalExchanges}`,
			`Checkpoints Completed: ${report.completedCount} / ${report.totalCriteria}`,
			``,
			`## Category Scores:`,
			...report.categories.map((c) => `- ${c.category}: ${c.score}/${c.max} (${c.percentage}%)`),
			``,
			`## Strengths:`,
			...report.strengths.map((s) => `- ${s}`),
			``,
			`## Recommendations:`,
			...report.recommendations.map((r) => `- ${r}`),
			``,
			`## Complete Dialogue Transcript:`,
			...messages.map((m) => `**${m.role === 'user' ? 'Officer TM' : 'Jordan Hale'}**: ${m.content}\n`),
		];

		const blob = new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8' });
		const url = URL.createObjectURL(blob);
		const link = document.createElement('a');
		link.href = url;
		link.download = `nypd-studio-evaluation-${scenario.id}.md`;
		document.body.appendChild(link);
		link.click();
		document.body.removeChild(link);
		URL.revokeObjectURL(url);
	};

	return (
		<div className="relative w-full max-w-4xl animate-fade-up">
			{/* Top Header Card */}
			<div className="border border-primary/30 bg-card p-6 shadow-gold-deep sm:p-8">
				<div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-border pb-6">
					<div>
						<div className="flex items-center gap-2">
							<span className="inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-2.5 py-0.5 font-mono text-[10px] tracking-widest text-primary uppercase">
								<ShieldCheck className="h-3 w-3" />
								Officer TM Evaluation
							</span>
							<span className="font-mono text-[10px] tracking-widest text-muted-foreground uppercase">
								{scenario.index} — {scenario.title}
							</span>
						</div>
						<h1 className="mt-2 font-display text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
							Call Performance Studio
						</h1>
						<p className="mt-1 text-sm text-muted-foreground">
							Comprehensive review of citizen intake protocol, audio recording, and scenario milestones.
						</p>
					</div>

					<div className="flex items-center gap-3 self-start sm:self-auto">
						<button
							type="button"
							onClick={copyEvaluationReport}
							className="flex h-10 items-center gap-1.5 border border-border bg-background px-3.5 font-mono text-xs tracking-wider uppercase transition-colors hover:border-primary hover:text-primary"
						>
							{copied ? <Check className="h-4 w-4 text-primary" /> : <Copy className="h-4 w-4" />}
							{copied ? 'Copied Report' : 'Copy Report'}
						</button>
						<button
							type="button"
							onClick={downloadReportMarkdown}
							className="flex h-10 items-center gap-1.5 border border-border bg-background px-3.5 font-mono text-xs tracking-wider uppercase transition-colors hover:border-primary hover:text-primary"
						>
							<FileText className="h-4 w-4" />
							Export MD
						</button>
					</div>
				</div>

				{/* Primary Score Summary */}
				<div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-4">
					{/* Overall Grade Card */}
					<div className="flex flex-col justify-between border border-primary/40 bg-primary/5 p-5 text-center sm:col-span-1">
						<div>
							<p className="font-mono text-[10px] tracking-[0.25em] text-primary uppercase">
								Protocol Grade
							</p>
							<p className="mt-2 font-display text-5xl font-black tracking-tight text-primary">
								{report.letterGrade}
							</p>
							<p className="mt-1 font-mono text-xs font-semibold text-foreground">
								{report.overallScore}% Compliance
							</p>
						</div>
						<div className="mt-3 border-t border-primary/20 pt-2 text-center">
							<span className="font-mono text-[10px] text-muted-foreground uppercase">
								{report.completedCount} / {report.totalCriteria} Checked
							</span>
						</div>
					</div>

					{/* Metrics Grid */}
					<div className="grid grid-cols-3 gap-px border border-border bg-border sm:col-span-3">
						<div className="bg-background p-4 flex flex-col justify-center">
							<p className="font-mono text-[10px] tracking-[0.2em] text-muted-foreground uppercase">
								Call Duration
							</p>
							<p className="mt-1 font-display text-2xl font-bold tabular-nums text-foreground">
								{formatTime(durationSeconds)}
							</p>
							<p className="mt-0.5 text-[11px] text-muted-foreground">Elapsed call time</p>
						</div>
						<div className="bg-background p-4 flex flex-col justify-center">
							<p className="font-mono text-[10px] tracking-[0.2em] text-muted-foreground uppercase">
								Officer Turns
							</p>
							<p className="mt-1 font-display text-2xl font-bold tabular-nums text-foreground">
								{report.totalExchanges}
							</p>
							<p className="mt-0.5 text-[11px] text-muted-foreground">User queries & statements</p>
						</div>
						<div className="bg-background p-4 flex flex-col justify-center">
							<p className="font-mono text-[10px] tracking-[0.2em] text-muted-foreground uppercase">
								Recording
							</p>
							<p className="mt-1 font-display text-2xl font-bold tabular-nums text-foreground">
								{recordingResult ? `${formatTime(recordingResult.duration)}` : 'Logged'}
							</p>
							<p className="mt-0.5 text-[11px] text-muted-foreground">
								{recordingResult ? 'Audio capture active' : 'Text transcript mode'}
							</p>
						</div>
					</div>
				</div>

				{/* Grade Commentary Banner */}
				<div className="mt-4 flex items-center gap-3 border border-border bg-background/60 px-4 py-3 text-xs text-foreground">
					<Sparkles className="h-4 w-4 shrink-0 text-primary" />
					<p>
						<strong className="text-primary font-medium">Coach Assessment:</strong> {report.gradeComment}
					</p>
				</div>

				{/* Audio Recording Player Section */}
				<div className="mt-6 border border-border bg-background p-5">
					<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-border/60 pb-3">
						<div className="flex items-center gap-2">
							<span className="flex h-3 w-3 items-center justify-center">
								{recordingResult ? (
									<span className="relative flex h-2.5 w-2.5">
										<span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
										<span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
									</span>
								) : (
									<Radio className="h-3 w-3 text-muted-foreground" />
								)}
							</span>
							<p className="font-mono text-xs tracking-wider text-foreground uppercase">
								{recordingResult ? 'Studio Audio Recording' : 'Call Transcript Recording'}
							</p>
						</div>

						{recordingResult ? (
							<div className="flex items-center gap-2">
								<a
									href={recordingResult.url}
									download={`call-recording-${scenario.id}.webm`}
									className="flex h-8 items-center gap-1.5 border border-primary/40 bg-primary/10 px-3 font-mono text-[11px] tracking-wider text-primary uppercase transition-colors hover:bg-primary hover:text-primary-foreground"
								>
									<Download className="h-3.5 w-3.5" />
									Download Audio (.webm)
								</a>
							</div>
						) : null}
					</div>

					{recordingResult ? (
						<div className="mt-4 space-y-3">
							<audio ref={audioRef} src={recordingResult.url} preload="metadata" />

							{/* Audio Scrubber */}
							<div className="space-y-1">
								<input
									type="range"
									min={0}
									max={audioDuration || recordingResult.duration || 1}
									step={0.1}
									value={audioCurrentTime}
									onChange={handleSeek}
									className="w-full accent-primary cursor-pointer"
								/>
								<div className="flex justify-between font-mono text-[10px] text-muted-foreground">
									<span>{formatTime(audioCurrentTime)}</span>
									<span>{formatTime(audioDuration || recordingResult.duration)}</span>
								</div>
							</div>

							{/* Audio Controls */}
							<div className="flex items-center justify-between pt-1">
								<div className="flex items-center gap-3">
									<button
										type="button"
										onClick={togglePlayAudio}
										className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground transition-transform hover:scale-105 active:scale-95"
									>
										{isPlayingAudio ? (
											<Pause className="h-4 w-4" />
										) : (
											<Play className="h-4 w-4 ml-0.5" />
										)}
									</button>
									<span className="font-mono text-xs text-foreground">
										{isPlayingAudio ? 'Playing conversation recording…' : 'Play recorded conversation'}
									</span>
								</div>

								{/* Playback speed buttons */}
								<div className="flex items-center gap-1 border border-border p-1 bg-card">
									{[1, 1.25, 1.5].map((speed) => (
										<button
											key={speed}
											type="button"
											onClick={() => handlePlaybackRateChange(speed)}
											className={`px-2 py-0.5 font-mono text-[10px] uppercase transition-colors ${
												playbackRate === speed
													? 'bg-primary text-primary-foreground font-semibold'
													: 'text-muted-foreground hover:text-foreground'
											}`}
										>
											{speed}x
										</button>
									))}
								</div>
							</div>
						</div>
					) : (
						<div className="mt-3 text-xs text-muted-foreground">
							Microphone audio was not captured during this drill (or call was conducted via text). The complete dialogue transcript below has been fully evaluated against NYPD SOP standards.
						</div>
					)}
				</div>

				{/* Tabs Navigation */}
				<div className="mt-6 flex border-b border-border">
					<button
						type="button"
						onClick={() => setActiveTab('scorecard')}
						className={`flex items-center gap-2 border-b-2 px-5 py-3 font-mono text-xs tracking-wider uppercase transition-colors ${
							activeTab === 'scorecard'
								? 'border-primary text-primary font-semibold'
								: 'border-transparent text-muted-foreground hover:text-foreground'
						}`}
					>
						<Award className="h-4 w-4" />
						Scorecard & Insights
					</button>
					<button
						type="button"
						onClick={() => setActiveTab('checklist')}
						className={`flex items-center gap-2 border-b-2 px-5 py-3 font-mono text-xs tracking-wider uppercase transition-colors ${
							activeTab === 'checklist'
								? 'border-primary text-primary font-semibold'
								: 'border-transparent text-muted-foreground hover:text-foreground'
						}`}
					>
						<CheckCircle2 className="h-4 w-4" />
						Protocol Checklist ({report.completedCount}/{report.totalCriteria})
					</button>
					<button
						type="button"
						onClick={() => setActiveTab('transcript')}
						className={`flex items-center gap-2 border-b-2 px-5 py-3 font-mono text-xs tracking-wider uppercase transition-colors ${
							activeTab === 'transcript'
								? 'border-primary text-primary font-semibold'
								: 'border-transparent text-muted-foreground hover:text-foreground'
						}`}
					>
						<FileText className="h-4 w-4" />
						Transcript Review ({messages.length})
					</button>
				</div>

				{/* Tab 1: Scorecard & Insights */}
				{activeTab === 'scorecard' ? (
					<div className="mt-6 space-y-6">
						{/* Category Breakdown Progress Bars */}
						<div>
							<h3 className="font-mono text-xs tracking-wider text-muted-foreground uppercase">
								Category Performance
							</h3>
							<div className="mt-3 space-y-3">
								{report.categories.map((category) => (
									<div key={category.category} className="space-y-1">
										<div className="flex justify-between text-xs">
											<span className="font-medium text-foreground">{category.category}</span>
											<span className="font-mono text-muted-foreground">
												{category.score} / {category.max} ({category.percentage}%)
											</span>
										</div>
										<div className="h-2 w-full overflow-hidden bg-secondary">
											<div
												className={`h-full transition-all duration-500 ${
													category.percentage >= 80
														? 'bg-primary'
														: category.percentage >= 50
															? 'bg-amber-500'
															: 'bg-destructive'
												}`}
												style={{ width: `${category.percentage}%` }}
											/>
										</div>
									</div>
								))}
							</div>
						</div>

						{/* Strengths & Recommendations */}
						<div className="grid grid-cols-1 gap-5 md:grid-cols-2">
							<div className="border border-emerald-500/30 bg-emerald-500/5 p-4">
								<div className="flex items-center gap-2 text-emerald-400">
									<CheckCircle2 className="h-4 w-4" />
									<h4 className="font-mono text-xs tracking-wider uppercase font-semibold">
										Key Strengths
									</h4>
								</div>
								<ul className="mt-3 space-y-2 text-xs text-muted-foreground">
									{report.strengths.map((str, i) => (
										<li key={i} className="flex items-start gap-2">
											<span className="text-emerald-400 font-bold">•</span>
											<span>{str}</span>
										</li>
									))}
								</ul>
							</div>

							<div className="border border-amber-500/30 bg-amber-500/5 p-4">
								<div className="flex items-center gap-2 text-amber-400">
									<Sparkles className="h-4 w-4" />
									<h4 className="font-mono text-xs tracking-wider uppercase font-semibold">
										Coaching Recommendations
									</h4>
								</div>
								<ul className="mt-3 space-y-2 text-xs text-muted-foreground">
									{report.recommendations.map((rec, i) => (
										<li key={i} className="flex items-start gap-2">
											<span className="text-amber-400 font-bold">•</span>
											<span>{rec}</span>
										</li>
									))}
								</ul>
							</div>
						</div>
					</div>
				) : null}

				{/* Tab 2: Protocol Checklist */}
				{activeTab === 'checklist' ? (
					<div className="mt-6 space-y-4">
						{report.criteria.map((item) => (
							<div
								key={item.id}
								className={`border p-4 transition-colors ${
									item.completed
										? 'border-emerald-500/30 bg-emerald-500/5'
										: 'border-border bg-background'
								}`}
							>
								<div className="flex items-start gap-3">
									<div className="mt-0.5 shrink-0">
										{item.completed ? (
											<CheckCircle2 className="h-5 w-5 text-emerald-400" />
										) : (
											<XCircle className="h-5 w-5 text-muted-foreground/60" />
										)}
									</div>
									<div className="flex-1">
										<div className="flex flex-wrap items-center justify-between gap-2">
											<p className="font-medium text-sm text-foreground">{item.label}</p>
											<span className="font-mono text-[10px] tracking-widest text-muted-foreground uppercase">
												{item.category}
											</span>
										</div>
										<p className="mt-1 text-xs text-muted-foreground">{item.description}</p>

										{item.completed && item.evidence ? (
											<div className="mt-2.5 border-l-2 border-emerald-400/80 bg-background/80 py-1.5 px-3 text-xs italic text-foreground">
												<span className="font-mono text-[10px] not-italic text-emerald-400 uppercase font-semibold block">
													Verified Officer Question:
												</span>
												"{item.evidence}"
											</div>
										) : null}

										{!item.completed && item.recommendation ? (
											<div className="mt-2.5 border-l-2 border-amber-400/80 bg-amber-500/10 py-1.5 px-3 text-xs text-amber-200">
												<span className="font-mono text-[10px] text-amber-400 uppercase font-semibold block">
													Missed Standard:
												</span>
												{item.recommendation}
											</div>
										) : null}
									</div>
								</div>
							</div>
						))}
					</div>
				) : null}

				{/* Tab 3: Transcript Review */}
				{activeTab === 'transcript' ? (
					<div className="mt-6 space-y-3">
						{messages.length === 0 ? (
							<p className="text-center text-sm text-muted-foreground py-8">
								No dialogue turns recorded.
							</p>
						) : (
							report.annotatedTurns.map((turn, index) => (
								<div
									key={index}
									className={`border p-4 transition-colors ${
										turn.role === 'user'
											? 'border-primary/30 bg-primary/5 ml-4 sm:ml-12'
											: 'border-border bg-card mr-4 sm:mr-12'
									}`}
								>
									<div className="flex items-center justify-between border-b border-border/40 pb-2">
										<span className="font-mono text-[10px] tracking-widest font-semibold uppercase text-primary">
											{turn.role === 'user' ? 'Officer TM' : `${scenario.personaName} (Citizen)`}
										</span>
										{turn.intentTag ? (
											<span className="font-mono text-[9px] tracking-wider rounded border border-border px-1.5 py-0.5 text-muted-foreground uppercase">
												{turn.intentTag}
											</span>
										) : null}
									</div>
									<p className="mt-2 text-sm leading-relaxed text-foreground">
										{turn.content || '…'}
									</p>
								</div>
							))
						)}
					</div>
				) : null}

				{/* Action Buttons */}
				<div className="mt-8 flex flex-col gap-3 border-t border-border pt-6 sm:flex-row">
					<button
						type="button"
						onClick={onCallAgain}
						className="flex h-12 flex-1 items-center justify-center gap-2 bg-primary font-mono text-sm font-semibold tracking-widest text-primary-foreground uppercase transition-transform hover:-translate-y-0.5 active:translate-y-0"
					>
						<RotateCcw className="h-4 w-4" />
						Practice Call Again
					</button>
					<Link
						to="/"
						className="flex h-12 flex-1 items-center justify-center gap-2 border border-border font-mono text-sm tracking-widest uppercase transition-colors hover:border-primary hover:text-primary"
					>
						<ArrowLeft className="h-4 w-4" />
						All Studio Scenarios
					</Link>
				</div>
			</div>
		</div>
	);
}
