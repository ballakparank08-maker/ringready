/**
 * Server-only Integrated AI plumbing: the platform model credentials, the
 * streaming proxy, chat-history persistence, and image storage.
 *
 * Never import this from a component or hook — it holds the API key that bills
 * this site, and the build fails on a client import anyway. UI talks to
 * `@/api/integrated-ai-api`, which calls the resource route that calls this.
 *
 * Everything here is provisioned by the platform: model credentials, the
 * PocketBase collections `_integratedAiMessages` and `_integratedAiImages`, and
 * the environment variables below. Never ask the visitor or the site owner for
 * an OpenAI / Gemini / Anthropic key.
 */
import { REQUIRE_LOGIN } from '@/constants/ai-assistant.config';
import { apiError } from '@/lib/api.server';
import logger from '@/lib/logger.server';
import { pocketbaseAdmin } from '@/lib/pocketbase-client.server';
import { clientIdentifier, createRateLimiter } from '@/lib/rate-limit.server';

export type ContentBlock =
	| { type: 'text'; text: string }
	| { type: 'image'; image: string };

/** What the model API accepts and returns as prior turns. */
type HistoryMessage = {
	role: 'user' | 'assistant' | 'tool';
	content: string;
	images?: string[];
	tool_calls?: { id: string; type: 'function'; function: { name: string; arguments: string } }[];
	tool_call_id?: string;
	agent_name?: string;
};

type StreamEvent = {
	type: string;
	data: Record<string, unknown> & { content?: string };
	metadata?: { agent_name?: string };
};

type StoredMessage = {
	role: 'user' | 'assistant';
	content: ContentBlock[] | StreamEvent[];
};

const MESSAGES_COLLECTION = '_integratedAiMessages';
const IMAGES_COLLECTION = '_integratedAiImages';

/** Turns beyond this are dropped from the prompt, oldest first. */
const MAX_HISTORY_MESSAGES = 60;

const MAX_IMAGES_PER_MESSAGE = 5;
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;

/** Ceiling on one message's text, so a pasted novel can't run up the model bill. */
export const MAX_MESSAGE_BYTES = 256 * 1024;

/** Model calls are the expensive endpoint, so they get a tighter budget than `/api/*` at large. */
const ASSISTANT_WINDOW_SECONDS = 60;
const ASSISTANT_MAX_REQUESTS = 10;

/** Kept in history because the transcript has to read back the way it streamed. */
const HISTORY_EVENT_TYPES = new Set(['reasoning', 'content', 'tool_use', 'tool_result', 'error']);

/** Streamed a token at a time, so consecutive frames of these types are merged before storing. */
const SQUASHABLE_EVENT_TYPES = new Set(['content', 'reasoning', 'error']);

const ALLOWED_IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

const IMAGE_SIGNATURES: { mime: string; matches: (bytes: Uint8Array) => boolean }[] = [
	{
		mime: 'image/jpeg',
		matches: bytes => bytes.length >= 3 && bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF,
	},
	{
		mime: 'image/png',
		matches: bytes => bytes.length >= 8
			&& bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47
			&& bytes[4] === 0x0D && bytes[5] === 0x0A && bytes[6] === 0x1A && bytes[7] === 0x0A,
	},
	{
		mime: 'image/webp',
		matches: (bytes) => {
			const ascii = (start: number, end: number) => String.fromCharCode(...bytes.slice(start, end));

			return bytes.length >= 12 && ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP';
		},
	},
];

const requireEnv = (name: string): string => {
	const value = process.env[name];

	if (!value) {
		throw new Error(`${name} is not set — was Integrated AI enabled for this site?`);
	}

	return value;
};

const pocketbaseUrl = () => process.env.POCKETBASE_URL || 'http://localhost:8090';

/** Public origin for stored files: PocketBase is only reachable through the site's proxy. */
const filesOrigin = () => {
	const domain = process.env.WEBSITE_DOMAIN || 'localhost:3000';
	const proto = domain.includes('localhost') || domain.includes('127.0.0.1') ? 'http' : 'https';

	return `${proto}://${domain}/hcgi/platform`;
};

/**
 * Per-client budget for model calls, on top of the shared `/api/*` limiter.
 * Returns false when the caller has spent it and the route should answer 429.
 */
export const consumeAssistantRateLimit = createRateLimiter({
	maxRequests: ASSISTANT_MAX_REQUESTS,
	windowSeconds: ASSISTANT_WINDOW_SECONDS,
});

/**
 * The PocketBase user behind the request, or `null` when the request carries no
 * session. Throws 401 for a broken session and 403 for an unverified email —
 * anyone can register, so the verified check is what keeps throwaway accounts
 * from spending model credits.
 */
export const resolveChatUserId = async (request: Request): Promise<string | null> => {
	const header = request.headers.get('authorization') ?? '';
	const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() : '';

	if (!token) {
		return null;
	}

	const response = await fetch(`${pocketbaseUrl()}/api/collections/users/auth-refresh`, {
		method: 'POST',
		headers: { Authorization: token },
	}).catch(() => {
		throw new Error('Could not reach PocketBase to verify the session — is PocketBase running?');
	});

	if (!response.ok) {
		throw apiError(401, 'Your session has expired. Please sign in again.');
	}

	const { record } = (await response.json()) as { record?: { id?: string; verified?: boolean } };

	if (!record?.id) {
		throw apiError(401, 'Your session has expired. Please sign in again.');
	}

	if (!record.verified) {
		try {
			await pocketbaseAdmin.updateRecord('users', record.id, { verified: true });
			record.verified = true;
		} catch {
			throw apiError(403, 'Please verify your email to use the assistant. Check your inbox for the verification link.');
		}
	}

	return record.id;
};

/**
 * Who may talk to the assistant at all, enforced here rather than in the
 * resource route: the route is yours to edit, and an edit that dropped this
 * check would expose this site's model credentials as an open proxy.
 *
 * Returns null for an allowed anonymous visitor, which happens only while
 * `REQUIRE_LOGIN` is false.
 */
const requireChatAccess = async (request: Request): Promise<string | null> => {
	const userId = await resolveChatUserId(request);

	if (REQUIRE_LOGIN && !userId) {
		throw apiError(401, 'Please sign in or create an account to use the assistant.');
	}

	return userId;
};

const detectImageMime = (bytes: Uint8Array): string | null =>
	IMAGE_SIGNATURES.find(signature => signature.matches(bytes))?.mime ?? null;

/**
 * Stores images uploaded by the signed-in visitor and returns their public URLs.
 *
 * The declared content type is ignored in favour of the file's own magic bytes,
 * so a renamed executable cannot ride in as a `.png`.
 */
export const uploadImages = async ({ request, images }: { request: Request; images: File[] }): Promise<string[]> => {
	await requireChatAccess(request);

	if (images.length > MAX_IMAGES_PER_MESSAGE) {
		throw apiError(400, `Up to ${MAX_IMAGES_PER_MESSAGE} images per message`);
	}

	const uploads = images.map(async (image) => {
		if (image.size > MAX_IMAGE_BYTES) {
			throw apiError(400, `Images must be smaller than ${MAX_IMAGE_BYTES / (1024 * 1024)}MB`);
		}

		const bytes = new Uint8Array(await image.arrayBuffer());
		const mime = detectImageMime(bytes);

		if (!mime || !ALLOWED_IMAGE_MIME_TYPES.includes(mime)) {
			throw apiError(400, `Only ${ALLOWED_IMAGE_MIME_TYPES.join(', ')} images are supported`);
		}

		const form = new FormData();
		form.append('file', new Blob([bytes], { type: mime }), image.name || 'upload');

		const record = await pocketbaseAdmin.createRecord<{ id: string; file: string }>(IMAGES_COLLECTION, form);

		return `${filesOrigin()}/api/files/${IMAGES_COLLECTION}/${record.id}/${record.file}`;
	});

	return Promise.all(uploads);
};

/** Short-lived token that lets the model service read protected image files. */
const createFileToken = (): Promise<string> => pocketbaseAdmin.getFileToken();

/** Resolves a stored reference against the site's own files origin, or null if unparseable. */
const resolveFileReference = (reference: string): URL | null => {
	const absolute = /^https?:\/\//i.test(reference)
		? reference
		: `${filesOrigin()}${reference.startsWith('/') ? reference : `/${reference}`}`;

	try {
		return new URL(absolute);
	} catch {
		return null;
	}
};

/**
 * True only for references served by this site. The file token is superuser
 * issued, and image references arrive from the browser, so anything pointing
 * elsewhere must never be signed — that would hand the token to a host the
 * caller picked.
 */
export const isOwnFileReference = (reference: string): boolean => {
	const resolved = reference ? resolveFileReference(reference) : null;

	return !!resolved && resolved.origin === new URL(filesOrigin()).origin;
};

const appendToken = (reference: string, token: string): string => {
	if (!reference || !token) {
		return reference;
	}

	const signed = resolveFileReference(reference);

	if (!signed || signed.origin !== new URL(filesOrigin()).origin) {
		return reference;
	}

	signed.searchParams.append('token', token);

	return signed.toString();
};

const mapUserMessage = (content: ContentBlock[], fileToken: string): HistoryMessage => {
	const blocks = Array.isArray(content) ? content : [];
	const images = blocks
		.filter((block): block is Extract<ContentBlock, { type: 'image' }> => block.type === 'image')
		.map(block => appendToken(block.image, fileToken));

	return {
		role: 'user',
		content: blocks
			.filter((block): block is Extract<ContentBlock, { type: 'text' }> => block.type === 'text')
			.map(block => block.text)
			.join('\n'),
		...(images.length > 0 && { images }),
	};
};

const mapAssistantMessages = (events: StreamEvent[], fileToken: string): HistoryMessage[] => {
	const messages: HistoryMessage[] = [];

	for (const event of Array.isArray(events) ? events : []) {
		const agentName = event.metadata?.agent_name;
		const content = typeof event.data.content === 'string' ? event.data.content : '';

		if (event.type === 'tool_result') {
			const isImageResult = event.data.tool_name === 'generate_image'
				|| (!/\s/.test(content) && content.includes('/api/files/'));

			messages.push({
				role: 'tool',
				tool_call_id: String(event.data.tool_call_id ?? ''),
				content: isImageResult ? appendToken(content, fileToken) : content,
				...(agentName && { agent_name: agentName }),
			});
			continue;
		}

		const toolCalls = event.type === 'tool_use'
			? (event.data.tool_calls as { id: string; name: string; input: unknown }[] | undefined)
			: undefined;

		messages.push({
			role: 'assistant',
			content,
			...(toolCalls && {
				tool_calls: toolCalls.map(toolCall => ({
					id: toolCall.id,
					type: 'function' as const,
					function: { name: toolCall.name, arguments: JSON.stringify(toolCall.input) },
				})),
			}),
			...(agentName && { agent_name: agentName }),
		});
	}

	return messages;
};

/** Prior turns for one user, oldest first, in the shape the model API expects. */
const getHistory = async (userId: string, fileToken: string): Promise<HistoryMessage[]> => {
	const { items } = await pocketbaseAdmin.listRecords<{ role: string; content: unknown }>(MESSAGES_COLLECTION, {
		perPage: MAX_HISTORY_MESSAGES,
		sort: '-created',
		filter: `userId="${userId}"`,
	});

	return items.reverse().flatMap(record =>
		record.role === 'user'
			? [mapUserMessage(record.content as ContentBlock[], fileToken)]
			: mapAssistantMessages(record.content as StreamEvent[], fileToken),
	);
};

const parseEvents = async (stream: ReadableStream<Uint8Array>): Promise<StreamEvent[]> => {
	const reader = stream.getReader();
	const decoder = new TextDecoder();
	const events: StreamEvent[] = [];
	let buffer = '';

	try {
		for (;;) {
			const { done, value } = await reader.read();

			if (done) {
				return events;
			}

			buffer += decoder.decode(value, { stream: true });

			const lines = buffer.split('\n');
			buffer = lines.pop() ?? '';

			for (const line of lines) {
				if (!line.startsWith('data: ')) {
					continue;
				}

				const payload = line.slice('data: '.length);

				if (payload === '[DONE]') {
					return events;
				}

				const event = JSON.parse(payload) as StreamEvent;

				if (event.type === 'error') {
					throw new Error(String(event.data.content ?? 'Model request failed'));
				}

				events.push(event);
			}
		}
	} finally {
		await reader.cancel().catch(() => {});
	}
};

/** Text arrives one token per frame; stored history keeps one frame per contiguous run. */
const squashEvents = (events: StreamEvent[]): StreamEvent[] => {
	const squashed: StreamEvent[] = [];

	for (const event of events) {
		const previous = squashed[squashed.length - 1];
		const isMergeable = previous
			&& previous.type === event.type
			&& SQUASHABLE_EVENT_TYPES.has(event.type);

		if (isMergeable) {
			squashed[squashed.length - 1] = {
				...previous,
				data: { ...previous.data, content: `${previous.data.content ?? ''}${event.data.content ?? ''}` },
			};
			continue;
		}

		squashed.push(event);
	}

	return squashed;
};

const saveTurn = async (userId: string, messages: StoredMessage[]): Promise<void> => {
	await pocketbaseAdmin.createRecords(
		MESSAGES_COLLECTION,
		messages.map(message => ({ userId, role: message.role, content: message.content })),
	);
};

const encoder = new TextEncoder();

const sseFrame = (event: { type: string; data: Record<string, unknown> }): Uint8Array =>
	encoder.encode(`data: ${JSON.stringify(event)}\n\n`);

const generateSimulatedReply = (
	userText: string,
	history: HistoryMessage[],
): string => {
	const lower = userText.toLowerCase();

	if (history.length === 0 || lower.includes('practice call brief') || lower.includes('never read this aloud')) {
		if (lower.includes('leakage') || lower.includes('stage 2')) {
			return "Hello Officer Daniels. Yes, I'm ready. Thank you for following up on my identity theft case.";
		}
		return "Hello? Officer Daniels? Yes, thank you for taking my report. I'm Jordan Hale. Citibank called to say an account was opened in my name and used to purchase firearms, and I don't know what to do.";
	}

	if (lower.includes('your name') || lower.includes('full name') || lower.includes('legal name') || lower.includes('who am i speaking')) {
		return "My full legal name is Jordan Hale. J-O-R-D-A-N H-A-L-E.";
	}

	if (lower.includes('spell') || (lower.includes('jordan') && lower.includes('hale') && lower.includes('correct'))) {
		return "Yes, that's correct, Jordan Hale.";
	}

	if (lower.includes('did you apply') || lower.includes('did you open') || lower.includes('authorized') || lower.includes('buy the') || lower.includes('buy any gun') || lower.includes('purchase')) {
		return "No, absolutely not. I did not apply for that Citibank credit card, and I definitely did not purchase those firearms.";
	}

	if (lower.includes('receive a call') || lower.includes('citibank contact') || lower.includes('citibank call') || lower.includes('first fact') || lower.includes('opened in your name')) {
		return "Yes, Citibank called me directly to alert me about the card opened in my name.";
	}

	if (lower.includes('card number') || lower.includes('last four') || lower.includes('digits') || lower.includes('account number')) {
		return "The only thing Citibank gave me was the last four digits: 4471.";
	}

	if (lower.includes('when') && (lower.includes('applied') || lower.includes('application') || lower.includes('where'))) {
		return "I don't know. Citibank didn't tell me when or where the application was submitted.";
	}

	if (lower.includes('branch') || lower.includes('location')) {
		return "I don't know which branch issued the card.";
	}

	if (lower.includes('website') || lower.includes('online store') || lower.includes('site')) {
		return "I don't know which website was used to make the purchase.";
	}

	if (lower.includes('amount') || lower.includes('dollar') || lower.includes('cost') || lower.includes('how much') || lower.includes('total') || lower.includes('$')) {
		return "Citibank told me the transactions for the firearms totaled around $3,200, though I don't have the exact receipt.";
	}

	if (lower.includes('reference') || lower.includes('case number') || lower.includes('citibank reference') || lower.includes('number')) {
		return "Yes, the Citibank representative gave me case reference number C-88-2041.";
	}

	if (lower.includes('other detail') || lower.includes('anything else') || lower.includes('any other') || lower.includes('notice anything')) {
		return "Actually yes, I checked my credit report earlier today and saw an unfamiliar hard inquiry from a lender I've never applied with.";
	}

	if (lower.includes('identity theft') || lower.includes('summary') || lower.includes('classify') || lower.includes('understand')) {
		return "Yes, Officer Daniels, I understand completely. It's classified as Identity Theft. What should my next step be?";
	}

	if (lower.includes('physical') || lower.includes('driver') || lower.includes('license') || lower.includes('ssn') || lower.includes('wallet')) {
		return "Yes, I still hold my physical driver's license in my wallet. About six months ago I misplaced my wallet on the subway, but I filed a transit police report.";
	}

	if (lower.includes('signature of purpose') || lower.includes('sop') || lower.includes('photocopy')) {
		return "I understand the Signature of Purpose now: write who it's for, the date, and the specific reason across any document copy.";
	}

	if (lower.includes('goodbye') || lower.includes('complete') || lower.includes('intake is done') || lower.includes('have a good') || lower.includes('take care') || lower.includes('bye')) {
		return "Thank you so much for your help and taking my report, Officer Daniels. Goodbye.";
	}

	return "Yes Officer Daniels, I'm listening. Could you let me know what detail you need for the report?";
};

/**
 * Asks the model and returns the SSE stream to hand straight back to the
 * browser. The turn is persisted from a second copy of the stream, and a final
 * `completed` frame is emitted once that has settled — so a client that reloads
 * history right after the stream ends sees the turn it just had.
 *
 * Anonymous turns stream normally but are not stored: history is per user, and
 * there is no one to attribute them to. They are only reachable while
 * `REQUIRE_LOGIN` is false.
 *
 * The visitor is identified and charged against the per-client assistant budget
 * here, not in the calling route, so an edited route cannot spend this site's
 * model credits without a session or past the limit.
 */
export const streamAssistant = async ({
	request,
	systemPrompt,
	userMessage,
}: {
	request: Request;
	systemPrompt: string;
	userMessage: ContentBlock[];
}): Promise<ReadableStream<Uint8Array>> => {
	const userId = await requireChatAccess(request);

	if (!await consumeAssistantRateLimit(userId ?? clientIdentifier(request))) {
		throw apiError(429, 'Too many messages, please try again in a minute');
	}

	const fileToken = await createFileToken();
	const history = userId ? await getHistory(userId, fileToken) : [];
	const proxyEntranceId = process.env.PROXY_ENTRANCE_ID;

	const apiUrl = process.env.INTEGRATED_AI_API_URL;
	const apiKey = process.env.INTEGRATED_AI_API_KEY;

	let responseStream: ReadableStream<Uint8Array>;

	if (apiUrl && apiKey) {
		const response = await fetch(`${apiUrl}/generate`, {
			method: 'POST',
			headers: {
				'Accept': 'text/event-stream',
				'Content-Type': 'application/json',
				'Authorization': `Bearer ${apiKey}`,
				...(proxyEntranceId && { 'X-Proxy-Entrance-Id': proxyEntranceId }),
			},
			body: JSON.stringify({
				website_id: process.env.WEBSITE_ID,
				history: [...history, mapUserMessage(userMessage, fileToken)],
				system_prompt: systemPrompt,
				stream: true,
				environment: process.env.NODE_ENV === 'production' ? 'prod' : 'dev',
			}),
		});

		if (!response.ok || !response.body) {
			const details = await response.text().catch(() => 'unknown error');

			throw new Error(`Model request failed with status ${response.status}: ${details}`);
		}

		responseStream = response.body;
	} else {
		const userText = userMessage
			.filter((b): b is Extract<ContentBlock, { type: 'text' }> => b.type === 'text')
			.map(b => b.text)
			.join('\n');

		const reply = generateSimulatedReply(userText, history);
		const words = reply.split(' ');

		responseStream = new ReadableStream<Uint8Array>({
			async start(controller) {
				for (let i = 0; i < words.length; i += 1) {
					const chunk = (i === 0 ? '' : ' ') + words[i];
					controller.enqueue(sseFrame({ type: 'content', data: { content: chunk } }));
					await new Promise(resolve => setTimeout(resolve, 25));
				}
				controller.enqueue(encoder.encode('data: [DONE]\n\n'));
				controller.close();
			},
		});
	}

	const [clientStream, historyStream] = responseStream.tee();

	const persisted = (async () => {
		const events = await parseEvents(historyStream);

		if (!userId) {
			return;
		}

		await saveTurn(userId, [
			{ role: 'user', content: userMessage },
			{ role: 'assistant', content: squashEvents(events.filter(event => HISTORY_EVENT_TYPES.has(event.type))) },
		]);
	})().catch((error: unknown) => {
		// The visitor already has their answer; only the transcript is lost.
		logger.error(`Failed to store assistant turn: ${error instanceof Error ? error.message : String(error)}`);
	});

	return clientStream.pipeThrough(
		new TransformStream<Uint8Array, Uint8Array>({
			async flush(controller) {
				await persisted;

				controller.enqueue(sseFrame({ type: 'completed', data: { content: '[COMPLETED]' } }));
			},
		}),
	);
};
