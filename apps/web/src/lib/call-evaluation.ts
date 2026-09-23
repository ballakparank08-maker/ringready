/**
 * Automated Evaluation Engine for Call Studio.
 * Evaluates the transcript between Officer TM and citizen Jordan Hale
 * against official NYPD SOP guidelines and scenario goals.
 */

import type { ChatMessage } from '@/api/integrated-ai-api';

export interface EvaluationCriterion {
	id: string;
	category: string;
	label: string;
	description: string;
	completed: boolean;
	evidence?: string;
	recommendation?: string;
}

export interface EvaluationCategoryScore {
	category: string;
	score: number;
	max: number;
	percentage: number;
}

export interface ConversationTurnEvaluation {
	role: 'user' | 'assistant';
	content: string;
	intentTag?: string;
	complianceStatus?: 'compliant' | 'neutral' | 'attention';
	notes?: string;
}

export interface CallEvaluationReport {
	scenarioId: string;
	scenarioTitle: string;
	officerName: string;
	overallScore: number;
	letterGrade: 'A+' | 'A' | 'B' | 'C' | 'Incomplete';
	gradeComment: string;
	categories: EvaluationCategoryScore[];
	criteria: EvaluationCriterion[];
	strengths: string[];
	recommendations: string[];
	annotatedTurns: ConversationTurnEvaluation[];
	totalExchanges: number;
	completedCount: number;
	totalCriteria: number;
}

export function evaluateCallSession(
	scenarioId: string,
	messages: ChatMessage[]
): CallEvaluationReport {
	const userTurns = messages.filter((m) => m.role === 'user');
	const allUserText = userTurns.map((m) => m.content.toLowerCase()).join(' ');
	const isStage2 =
		scenarioId === 'identity-theft-leakage' ||
		allUserText.includes('stage 2') ||
		allUserText.includes('sop') ||
		allUserText.includes('boundary') ||
		allUserText.includes('leakage');

	return isStage2
		? evaluateStage2(scenarioId, messages)
		: evaluateStage1(scenarioId, messages);
}

// ----------------- STAGE 1 EVALUATION -----------------
function evaluateStage1(
	scenarioId: string,
	messages: ChatMessage[]
): CallEvaluationReport {
	const userTurns = messages.filter((m) => m.role === 'user');

	const findEvidence = (predicate: (text: string) => boolean): string | undefined => {
		for (const turn of userTurns) {
			if (predicate(turn.content.toLowerCase())) {
				return turn.content;
			}
		}
		return undefined;
	};

	const criteria: EvaluationCriterion[] = [
		{
			id: 'stg1_fact1_citibank_call',
			category: 'Intake Verification',
			label: 'Fact 1: Citibank Phone Call',
			description: 'Verify the citizen received a phone call from Citibank.',
			completed: Boolean(
				findEvidence(
					(t) =>
						(t.includes('citibank') && (t.includes('call') || t.includes('contact') || t.includes('alert'))) ||
						t.includes('fact 1') ||
						t.includes('fact one') ||
						t.includes('first fact')
				)
			),
			evidence: findEvidence(
				(t) =>
					(t.includes('citibank') && (t.includes('call') || t.includes('contact') || t.includes('alert'))) ||
					t.includes('fact 1') ||
					t.includes('fact one') ||
					t.includes('first fact')
			),
			recommendation: 'Ask clearly: "Did you receive a phone call from Citibank regarding this matter?"',
		},
		{
			id: 'stg1_fact2_account_exists',
			category: 'Intake Verification',
			label: 'Fact 2: Credit Card Account Exists',
			description: 'Verify a credit card account does exist under the citizen’s name.',
			completed: Boolean(
				findEvidence(
					(t) =>
						(t.includes('account') && (t.includes('exist') || t.includes('under your name') || t.includes('opened'))) ||
						t.includes('fact 2') ||
						t.includes('fact two') ||
						t.includes('second fact') ||
						(t.includes('card') && t.includes('in your name'))
				)
			),
			evidence: findEvidence(
				(t) =>
					(t.includes('account') && (t.includes('exist') || t.includes('under your name') || t.includes('opened'))) ||
					t.includes('fact 2') ||
					t.includes('fact two') ||
					t.includes('second fact') ||
					(t.includes('card') && t.includes('in your name'))
			),
			recommendation: 'Confirm that an unauthorized account exists under the citizen’s name.',
		},
		{
			id: 'stg1_fact3_firearms',
			category: 'Intake Verification',
			label: 'Fact 3: Four Firearms Purchased',
			description: 'Verify four firearms were purchased online using that account.',
			completed: Boolean(
				findEvidence(
					(t) =>
						t.includes('firearm') ||
						t.includes('gun') ||
						t.includes('four gun') ||
						t.includes('4 gun') ||
						t.includes('fact 3') ||
						t.includes('third fact')
				)
			),
			evidence: findEvidence(
				(t) =>
					t.includes('firearm') ||
					t.includes('gun') ||
					t.includes('four gun') ||
					t.includes('4 gun') ||
					t.includes('fact 3') ||
					t.includes('third fact')
			),
			recommendation: 'Check whether firearms/guns were purchased online with the fraudulent card.',
		},
		{
			id: 'stg1_fact4_unauthorized',
			category: 'Intake Verification',
			label: 'Fact 4: Citizen Did Not Apply / Authorize',
			description: 'Verify the citizen did not apply for the card and did not buy the guns.',
			completed: Boolean(
				findEvidence(
					(t) =>
						t.includes('did you apply') ||
						t.includes('did you open') ||
						t.includes('did you buy') ||
						t.includes('did you purchase') ||
						t.includes('authorize') ||
						t.includes('fact 4') ||
						t.includes('fourth fact')
				)
			),
			evidence: findEvidence(
				(t) =>
					t.includes('did you apply') ||
					t.includes('did you open') ||
					t.includes('did you buy') ||
					t.includes('did you purchase') ||
					t.includes('authorize') ||
					t.includes('fact 4') ||
					t.includes('fourth fact')
			),
			recommendation: 'Explicitly establish on the record that the citizen did not apply for this card or buy the items.',
		},
		{
			id: 'stg1_legal_name',
			category: 'Citizen Identification',
			label: 'Citizen Full Legal Name',
			description: 'Obtain the citizen’s full legal name on the official record.',
			completed: Boolean(
				findEvidence(
					(t) =>
						(t.includes('name') && (t.includes('full') || t.includes('legal') || t.includes('what') || t.includes('state') || t.includes('record'))) ||
						t.includes('who am i speaking')
				)
			),
			evidence: findEvidence(
				(t) =>
					(t.includes('name') && (t.includes('full') || t.includes('legal') || t.includes('what') || t.includes('state') || t.includes('record'))) ||
					t.includes('who am i speaking')
			),
			recommendation: 'Ask for the caller’s full legal name for the police intake record.',
		},
		{
			id: 'stg1_name_spelling',
			category: 'Citizen Identification',
			label: 'Verify Name Spelling',
			description: 'Spell back or confirm the spelling of Jordan Hale (J-O-R-D-A-N H-A-L-E).',
			completed: Boolean(
				findEvidence(
					(t) =>
						t.includes('spell') ||
						(t.includes('jordan') && t.includes('hale')) ||
						t.includes('h-a-l-e')
				)
			),
			evidence: findEvidence(
				(t) =>
					t.includes('spell') ||
					(t.includes('jordan') && t.includes('hale')) ||
					t.includes('h-a-l-e')
			),
			recommendation: 'Confirm the exact letter-by-letter spelling of the citizen’s full name.',
		},
		{
			id: 'stg1_q1_card_number',
			category: 'Credit Card Investigation',
			label: 'Q1: Card Number / Last 4 Digits',
			description: 'Ask for the credit card number or last 4 digits (4471).',
			completed: Boolean(
				findEvidence(
					(t) =>
						t.includes('card number') ||
						t.includes('last four') ||
						t.includes('last 4') ||
						t.includes('digits') ||
						t.includes('account number')
				)
			),
			evidence: findEvidence(
				(t) =>
					t.includes('card number') ||
					t.includes('last four') ||
					t.includes('last 4') ||
					t.includes('digits') ||
					t.includes('account number')
			),
			recommendation: 'Ask for the card number or the last 4 digits on the Citibank account.',
		},
		{
			id: 'stg1_q2_when_where',
			category: 'Credit Card Investigation',
			label: 'Q2: When & Where Applied',
			description: 'Inquire when and where the card application was submitted.',
			completed: Boolean(
				findEvidence(
					(t) =>
						(t.includes('when') && (t.includes('where') || t.includes('applied') || t.includes('application'))) ||
						t.includes('where was the application')
				)
			),
			evidence: findEvidence(
				(t) =>
					(t.includes('when') && (t.includes('where') || t.includes('applied') || t.includes('application'))) ||
					t.includes('where was the application')
			),
			recommendation: 'Ask when and where the fraudulent application was made.',
		},
		{
			id: 'stg1_q3_issuing_branch',
			category: 'Credit Card Investigation',
			label: 'Q3: Issuing Branch',
			description: 'Ask which Citibank branch issued the credit card.',
			completed: Boolean(findEvidence((t) => t.includes('branch'))),
			evidence: findEvidence((t) => t.includes('branch')),
			recommendation: 'Ask which branch or banking location issued the card.',
		},
		{
			id: 'stg1_q4_merchant_website',
			category: 'Credit Card Investigation',
			label: 'Q4: Website Used for Purchases',
			description: 'Ask which website or merchant was used to buy the firearms.',
			completed: Boolean(
				findEvidence(
					(t) =>
						t.includes('website') ||
						t.includes('merchant') ||
						t.includes('which site') ||
						t.includes('online store')
				)
			),
			evidence: findEvidence(
				(t) =>
					t.includes('website') ||
					t.includes('merchant') ||
					t.includes('which site') ||
					t.includes('online store')
			),
			recommendation: 'Inquire which specific website or merchant was used for the unauthorized purchases.',
		},
		{
			id: 'stg1_q5_amount',
			category: 'Credit Card Investigation',
			label: 'Q5: Transaction Amount',
			description: 'Ask for the total dollar amount of the transactions (~$3,200).',
			completed: Boolean(
				findEvidence(
					(t) =>
						t.includes('amount') ||
						t.includes('dollar') ||
						t.includes('cost') ||
						t.includes('how much') ||
						t.includes('total') ||
						t.includes('price') ||
						t.includes('$')
				)
			),
			evidence: findEvidence(
				(t) =>
					t.includes('amount') ||
					t.includes('dollar') ||
					t.includes('cost') ||
					t.includes('how much') ||
					t.includes('total') ||
					t.includes('price') ||
					t.includes('$')
			),
			recommendation: 'Ask for the dollar amount or financial total of the transactions.',
		},
		{
			id: 'stg1_q6_case_ref',
			category: 'Credit Card Investigation',
			label: 'Q6: Citibank Case Reference Number',
			description: 'Ask for the bank reference or case number (C-88-2041).',
			completed: Boolean(
				findEvidence(
					(t) =>
						t.includes('reference') ||
						t.includes('case number') ||
						t.includes('case #') ||
						t.includes('bank reference')
				)
			),
			evidence: findEvidence(
				(t) =>
					t.includes('reference') ||
					t.includes('case number') ||
					t.includes('case #') ||
					t.includes('bank reference')
			),
			recommendation: 'Request the Citibank internal case or reference number for police cross-referencing.',
		},
		{
			id: 'stg1_additional_inquiry',
			category: 'Protocol & Conclusion',
			label: 'Inquire Additional Details',
			description: 'Ask if the citizen has noticed any other suspicious activity (hard inquiry).',
			completed: Boolean(
				findEvidence(
					(t) =>
						t.includes('other detail') ||
						t.includes('anything else') ||
						t.includes('any other') ||
						t.includes('notice anything') ||
						t.includes('add anything')
				)
			),
			evidence: findEvidence(
				(t) =>
					t.includes('other detail') ||
					t.includes('anything else') ||
					t.includes('any other') ||
					t.includes('notice anything') ||
					t.includes('add anything')
			),
			recommendation: 'Always invite additional details: "Is there anything else you’ve noticed, such as on your credit report?"',
		},
		{
			id: 'stg1_plain_summary',
			category: 'Protocol & Conclusion',
			label: 'Plain-Language Summary',
			description: 'Deliver a concise summary of the facts back to the citizen.',
			completed: Boolean(
				findEvidence(
					(t) =>
						t.includes('summary') ||
						t.includes('summarize') ||
						(t.includes('so to recap') || t.includes('to review') || t.includes('in summary'))
				)
			),
			evidence: findEvidence(
				(t) =>
					t.includes('summary') ||
					t.includes('summarize') ||
					(t.includes('so to recap') || t.includes('to review') || t.includes('in summary'))
			),
			recommendation: 'Provide a clear plain-language summary reviewing the verified intake details.',
		},
		{
			id: 'stg1_id_theft_classification',
			category: 'Protocol & Conclusion',
			label: 'Identity Theft Classification',
			description: 'Formally classify report as Identity Theft and confirm citizen understanding.',
			completed: Boolean(
				findEvidence(
					(t) =>
						t.includes('identity theft') ||
						(t.includes('classify') && t.includes('theft')) ||
						(t.includes('understand') && t.includes('report'))
				)
			),
			evidence: findEvidence(
				(t) =>
					t.includes('identity theft') ||
					(t.includes('classify') && t.includes('theft')) ||
					(t.includes('understand') && t.includes('report'))
			),
			recommendation: 'State: "This case is formally classified as an Identity Theft report. Do you understand this classification?"',
		},
	];

	return buildReport('Stage 1 — Identity Theft Intake', criteria, messages, scenarioId);
}

// ----------------- STAGE 2 EVALUATION -----------------
function evaluateStage2(
	scenarioId: string,
	messages: ChatMessage[]
): CallEvaluationReport {
	const userTurns = messages.filter((m) => m.role === 'user');

	const findEvidence = (predicate: (text: string) => boolean): string | undefined => {
		for (const turn of userTurns) {
			if (predicate(turn.content.toLowerCase())) {
				return turn.content;
			}
		}
		return undefined;
	};

	const criteria: EvaluationCriterion[] = [
		{
			id: 'stg2_id_requirement',
			category: 'Jurisdiction & ID Foundation',
			label: 'Valid ID Requirement Question',
			description: 'Confirm citizen knows a valid ID is strictly required to open a credit card.',
			completed: Boolean(
				findEvidence(
					(t) =>
						t.includes('valid id') ||
						(t.includes('know') && t.includes('required') && t.includes('id')) ||
						t.includes('strictly required')
				)
			),
			evidence: findEvidence(
				(t) =>
					t.includes('valid id') ||
					(t.includes('know') && t.includes('required') && t.includes('id')) ||
					t.includes('strictly required')
			),
			recommendation: 'Ask: "Did you know that a valid ID is strictly required to apply for and open a credit card?"',
		},
		{
			id: 'stg2_ny_jurisdiction',
			category: 'Jurisdiction & ID Foundation',
			label: 'New York Jurisdiction Confirmation',
			description: 'Confirm the fraudulent credit card was issued in the NY jurisdiction.',
			completed: Boolean(
				findEvidence(
					(t) =>
						t.includes('new york') ||
						t.includes('jurisdiction') ||
						t.includes('issued in ny')
				)
			),
			evidence: findEvidence(
				(t) =>
					t.includes('new york') ||
					t.includes('jurisdiction') ||
					t.includes('issued in ny')
			),
			recommendation: 'Confirm whether the card was issued within the New York jurisdiction.',
		},
		{
			id: 'stg2_official_docs_requirement',
			category: 'Jurisdiction & ID Foundation',
			label: 'Official Documents (DL / SSN) Requirement',
			description: 'Confirm official US documents (Driver’s License or SSN) are required.',
			completed: Boolean(
				findEvidence(
					(t) =>
						(t.includes('official document') || t.includes('driver') || t.includes('ssn') || t.includes('social security')) &&
						(t.includes('require') || t.includes('needed'))
				)
			),
			evidence: findEvidence(
				(t) =>
					(t.includes('official document') || t.includes('driver') || t.includes('ssn') || t.includes('social security')) &&
					(t.includes('require') || t.includes('needed'))
			),
			recommendation: 'Verify that US official documents (Driver’s License or SSN) were mandatory for the application.',
		},
		{
			id: 'stg2_physical_id_possession',
			category: 'Jurisdiction & ID Foundation',
			label: 'Physical Driver’s License in Possession',
			description: 'Confirm the citizen still holds their physical driver’s license in their wallet.',
			completed: Boolean(
				findEvidence(
					(t) =>
						(t.includes('hold') || t.includes('keep') || t.includes('still have') || t.includes('in your wallet')) &&
						(t.includes('physical') || t.includes('license') || t.includes('driver'))
				)
			),
			evidence: findEvidence(
				(t) =>
					(t.includes('hold') || t.includes('keep') || t.includes('still have') || t.includes('in your wallet')) &&
					(t.includes('physical') || t.includes('license') || t.includes('driver'))
			),
			recommendation: 'Ask: "Do you still hold your physical driver’s license in your possession right now?"',
		},
		{
			id: 'stg2_leakage_conclusion',
			category: 'Leakage Discovery',
			label: 'Deliver Leakage Conclusion',
			description: 'Conclude that holding physical ID means information was copied/exposed, not physically stolen.',
			completed: Boolean(
				findEvidence(
					(t) =>
						t.includes('copied') ||
						(t.includes('rather than') && t.includes('stolen')) ||
						t.includes('leakage conclusion') ||
						t.includes('information was exposed')
				)
			),
			evidence: findEvidence(
				(t) =>
					t.includes('copied') ||
					(t.includes('rather than') && t.includes('stolen')) ||
					t.includes('leakage conclusion') ||
					t.includes('information was exposed')
			),
			recommendation: 'Deliver the diagnostic conclusion: "Since you hold the physical ID, your information was copied or leaked rather than stolen."',
		},
		{
			id: 'stg2_suspected_persons',
			category: 'Leakage Discovery',
			label: 'Inquire Suspected Persons / Places',
			description: 'Ask citizen if they suspect any individuals or locations where data leaked.',
			completed: Boolean(
				findEvidence(
					(t) =>
						t.includes('suspect') ||
						t.includes('where the leak') ||
						t.includes('suspected persons')
				)
			),
			evidence: findEvidence(
				(t) =>
					t.includes('suspect') ||
					t.includes('where the leak') ||
					t.includes('suspected persons')
			),
			recommendation: 'Ask if the citizen suspects anyone or any particular establishment.',
		},
		{
			id: 'stg2_lost_documents',
			category: 'Leakage Discovery',
			label: 'Inquire Lost Documents Status',
			description: 'Ask if the citizen has ever lost documents or wallets.',
			completed: Boolean(
				findEvidence(
					(t) =>
						t.includes('lost') &&
						(t.includes('document') || t.includes('wallet') || t.includes('card') || t.includes('ever'))
				)
			),
			evidence: findEvidence(
				(t) =>
					t.includes('lost') &&
					(t.includes('document') || t.includes('wallet') || t.includes('card') || t.includes('ever'))
			),
			recommendation: 'Inquire whether the citizen ever lost their wallet or official documents.',
		},
		{
			id: 'stg2_photocopy_usage',
			category: 'Leakage Discovery',
			label: 'Identify Other Document Usage (Rental Car)',
			description: 'Ask about document usage elsewhere (identified rental car photocopy).',
			completed: Boolean(
				findEvidence(
					(t) =>
						t.includes('used elsewhere') ||
						t.includes('rental') ||
						t.includes('photocopy') ||
						t.includes('hotel') ||
						t.includes('other document')
				)
			),
			evidence: findEvidence(
				(t) =>
					t.includes('used elsewhere') ||
					t.includes('rental') ||
					t.includes('photocopy') ||
					t.includes('hotel') ||
					t.includes('other document')
			),
			recommendation: 'Ask whether their license was ever photocopied for rentals, hotels, or services.',
		},
		{
			id: 'stg2_no_boundary',
			category: 'SOP & Protection Standards',
			label: 'Explain No-Boundary Concept',
			description: 'Explain that photocopied/digital identity data has no time or geographic boundary.',
			completed: Boolean(
				findEvidence(
					(t) =>
						t.includes('boundary') ||
						t.includes('geographic') ||
						t.includes('time boundary') ||
						t.includes('no boundary')
				)
			),
			evidence: findEvidence(
				(t) =>
					t.includes('boundary') ||
					t.includes('geographic') ||
					t.includes('time boundary') ||
					t.includes('no boundary')
			),
			recommendation: 'Teach the "no-boundary" principle: a leaked photocopy has no geographic or expiration limits.',
		},
		{
			id: 'stg2_sop_definition',
			category: 'SOP & Protection Standards',
			label: 'Define Signature of Purpose (SOP)',
			description: 'Explain what the Signature of Purpose (SOP) standard is.',
			completed: Boolean(
				findEvidence(
					(t) =>
						t.includes('signature of purpose') ||
						t.includes('sop') ||
						t.includes('standard operating procedure')
				)
			),
			evidence: findEvidence(
				(t) =>
					t.includes('signature of purpose') ||
					t.includes('sop') ||
					t.includes('standard operating procedure')
			),
			recommendation: 'Introduce and define the Signature of Purpose (SOP) cross-marking technique.',
		},
		{
			id: 'stg2_sop_four_points',
			category: 'SOP & Protection Standards',
			label: 'Teach the 4 SOP Required Points',
			description: 'Teach the 4 points: Organization, Specific Reason, Signature, Date.',
			completed: Boolean(
				findEvidence(
					(t) =>
						t.includes('four point') ||
						t.includes('4 point') ||
						t.includes('organization') ||
						t.includes('reason') ||
						t.includes('date') ||
						t.includes('four required')
				)
			),
			evidence: findEvidence(
				(t) =>
					t.includes('four point') ||
					t.includes('4 point') ||
					t.includes('organization') ||
					t.includes('reason') ||
					t.includes('date') ||
					t.includes('four required')
			),
			recommendation: 'List the 4 mandatory elements: 1) Organization name, 2) Specific purpose/reason, 3) Citizen signature, 4) Date.',
		},
		{
			id: 'stg2_accountability_conclusion',
			category: 'SOP & Protection Standards',
			label: 'Accountability Conclusion & Final Reminder',
			description: 'Deliver the accountability conclusion and remind citizen to strictly comply with SOP.',
			completed: Boolean(
				findEvidence(
					(t) =>
						t.includes('good care') ||
						t.includes('blame') ||
						t.includes('careful') ||
						t.includes('protect your documents') ||
						t.includes('final reminder') ||
						t.includes('comply')
				)
			),
			evidence: findEvidence(
				(t) =>
					t.includes('good care') ||
					t.includes('blame') ||
					t.includes('careful') ||
					t.includes('protect your documents') ||
					t.includes('final reminder') ||
					t.includes('comply')
			),
			recommendation: 'Emphasize document accountability and provide the final directive to use SOP on all future photocopies.',
		},
	];

	return buildReport('Stage 2 — Identity Theft Leakage', criteria, messages, scenarioId);
}

// ----------------- COMMON REPORT GENERATION -----------------
function buildReport(
	title: string,
	criteria: EvaluationCriterion[],
	messages: ChatMessage[],
	scenarioId: string
): CallEvaluationReport {
	const completedCount = criteria.filter((c) => c.completed).length;
	const totalCriteria = criteria.length;
	const overallScore = Math.round((completedCount / totalCriteria) * 100);

	let letterGrade: 'A+' | 'A' | 'B' | 'C' | 'Incomplete';
	let gradeComment: string;

	if (overallScore >= 95) {
		letterGrade = 'A+';
		gradeComment = 'Mastery level performance! Exceptional adherence to NYPD intake SOP.';
	} else if (overallScore >= 80) {
		letterGrade = 'A';
		gradeComment = 'Proficient officer execution. Thorough, methodical, and compliant with protocol.';
	} else if (overallScore >= 65) {
		letterGrade = 'B';
		gradeComment = 'Good effort. Core facts captured, but key SOP or investigation points were missed.';
	} else if (overallScore >= 40) {
		letterGrade = 'C';
		gradeComment = 'Incomplete intake. Multiple critical investigative questions were omitted.';
	} else {
		letterGrade = 'Incomplete';
		gradeComment = 'Session ended prematurely before protocol milestones were established.';
	}

	// Calculate category breakdowns
	const categoryMap = new Map<string, { completed: number; total: number }>();
	for (const c of criteria) {
		const existing = categoryMap.get(c.category) || { completed: 0, total: 0 };
		existing.total += 1;
		if (c.completed) existing.completed += 1;
		categoryMap.set(c.category, existing);
	}

	const categories: EvaluationCategoryScore[] = Array.from(categoryMap.entries()).map(
		([category, counts]) => ({
			category,
			score: counts.completed,
			max: counts.total,
			percentage: Math.round((counts.completed / counts.total) * 100),
		})
	);

	// Extract strengths & recommendations
	const strengths: string[] = [];
	const recommendations: string[] = [];

	for (const c of criteria) {
		if (c.completed) {
			if (strengths.length < 4) {
				strengths.push(`Successfully conducted ${c.label.toLowerCase()} according to protocol.`);
			}
		} else {
			if (recommendations.length < 4 && c.recommendation) {
				recommendations.push(c.recommendation);
			}
		}
	}

	if (strengths.length === 0) {
		strengths.push('Initiated the official call session with citizen Jordan Hale.');
	}
	if (recommendations.length === 0) {
		recommendations.push('Maintain this high standard of investigative consistency on subsequent drill scenarios.');
	}

	// Annotated turns
	const annotatedTurns: ConversationTurnEvaluation[] = messages.map((m) => {
		const lower = m.content.toLowerCase();
		if (m.role === 'assistant') {
			return {
				role: 'assistant',
				content: m.content,
				intentTag: 'Citizen Response',
				complianceStatus: 'neutral',
			};
		}

		let intentTag = 'General Inquiry';
		let complianceStatus: 'compliant' | 'neutral' | 'attention' = 'neutral';

		if (lower.includes('citibank') || lower.includes('fact')) {
			intentTag = 'Fact Verification';
			complianceStatus = 'compliant';
		} else if (lower.includes('name') || lower.includes('spell')) {
			intentTag = 'Identification';
			complianceStatus = 'compliant';
		} else if (lower.includes('card') || lower.includes('amount') || lower.includes('branch') || lower.includes('website')) {
			intentTag = 'Card Investigation';
			complianceStatus = 'compliant';
		} else if (lower.includes('sop') || lower.includes('signature of purpose') || lower.includes('boundary')) {
			intentTag = 'SOP Protocol';
			complianceStatus = 'compliant';
		} else if (lower.includes('identity theft') || lower.includes('summary')) {
			intentTag = 'Classification & Summary';
			complianceStatus = 'compliant';
		}

		return {
			role: 'user',
			content: m.content,
			intentTag,
			complianceStatus,
		};
	});

	const userTurns = messages.filter((m) => m.role === 'user');

	return {
		scenarioId,
		scenarioTitle: title,
		officerName: 'Officer TM',
		overallScore,
		letterGrade,
		gradeComment,
		categories,
		criteria,
		strengths,
		recommendations,
		annotatedTurns,
		totalExchanges: userTurns.length,
		completedCount,
		totalCriteria,
	};
}
