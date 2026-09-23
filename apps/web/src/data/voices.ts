/**
 * Caller Persona Voice Profiles
 * Provides distinct personas with different genders, pitch, rate,
 * and delivery styles for identity theft reporting drills.
 */

export interface CallerVoiceProfile {
	id: string;
	name: string;
	gender: 'male' | 'female' | 'neutral';
	style: string;
	tagline: string;
	description: string;
	avatarInitial: string;
	pitch: number;
	rate: number;
	badgeClass: string;
	toneCharacteristics: string[];
}

export const CALLER_VOICES: CallerVoiceProfile[] = [
	{
		id: 'jordan-hale',
		name: 'Jordan Hale',
		gender: 'neutral',
		style: 'Anxious & Cooperative',
		tagline: 'Quiet, polite, nervous citizen answering one step at a time',
		description:
			'Anxious citizen who is polite, cooperative, and a bit overwhelmed. Answers questions directly and seeks calm guidance from Officer TM.',
		avatarInitial: 'JH',
		pitch: 1.0,
		rate: 1.0,
		badgeClass: 'border-primary/40 bg-primary/10 text-primary',
		toneCharacteristics: ['Cautious', 'Polite', 'Step-by-step', 'Nervous'],
	},
	{
		id: 'marcus-vance',
		name: 'Marcus Vance',
		gender: 'male',
		style: 'Direct & Businesslike',
		tagline: 'Corporate executive demanding immediate escalation & action',
		description:
			'Busy executive caller who speaks firmly, crisp, and fast. Impatient with bank negligence, gives exact facts and demands immediate police action.',
		avatarInitial: 'MV',
		pitch: 0.88,
		rate: 1.06,
		badgeClass: 'border-blue-500/40 bg-blue-500/10 text-blue-400',
		toneCharacteristics: ['Assertive', 'Fast-paced', 'Impatient', 'Decisive'],
	},
	{
		id: 'elena-rodriguez',
		name: 'Elena Rodriguez',
		gender: 'female',
		style: 'Distressed & Emotional',
		tagline: 'Panicked mother deeply shaken by firearms purchased in her name',
		description:
			'Distressed citizen who is terrified that firearms were purchased using her identity. Speaks with emotion and urgency, needing reassurance while reporting.',
		avatarInitial: 'ER',
		pitch: 1.18,
		rate: 1.06,
		badgeClass: 'border-rose-500/40 bg-rose-500/10 text-rose-400',
		toneCharacteristics: ['Urgent', 'Emotional', 'Breathless', 'Vulnerable'],
	},
	{
		id: 'brenda-kowalski',
		name: 'Brenda Kowalski',
		gender: 'female',
		style: 'Skeptical & Indignant',
		tagline: 'Senior citizen verifying police identity & furious at bank negligence',
		description:
			'Cautious, observant senior who takes notes, verifies Officer TM’s credentials, and expresses outrage at Citibank’s security breakdown.',
		avatarInitial: 'BK',
		pitch: 0.96,
		rate: 0.94,
		badgeClass: 'border-amber-500/40 bg-amber-500/10 text-amber-400',
		toneCharacteristics: ['Methodical', 'Skeptical', 'Indignant', 'Careful'],
	},
];

export const getCallerVoiceById = (id: string | undefined): CallerVoiceProfile => {
	return CALLER_VOICES.find((v) => v.id === id) || CALLER_VOICES[0];
};

export const getCallerVoiceByName = (name: string | undefined): CallerVoiceProfile => {
	if (!name) return CALLER_VOICES[0];
	const lower = name.toLowerCase();
	return CALLER_VOICES.find((v) => lower.includes(v.name.toLowerCase())) || CALLER_VOICES[0];
};
