/**
 * Browser client for the site's AI assistant: send a message and stream the
 * answer, read the visitor's transcript, and clear it.
 *
 * The model credentials, the prompt, and the transcript all live on the server —
 * this file only speaks to the resource route, which must be registered in
 * `src/routes.ts`:
 *
 *   route('api/integrated-ai/stream', 'routes/api.integrated-ai.stream.ts'),
 *
 * Without that line every call here answers 404.
 *
 * Everything is per visitor and browser-only: call it from an event handler or
 * an effect, never from a server `loader`.
 */
import pb from '@/lib/pocketbase-client';

export type ChatMessage = {
	role: 'user' | 'assistant';
	content: string;
	/** Ready-to-render URLs — uploads on user turns, generated images on assistant turns. */
	images?: string[];
};

/** Raw server frame. Only worth handling for tool-progress UI or debugging. */
export type AssistantStreamEvent = {
	type: 'content' | 'reasoning' | 'tool_use' | 'tool_result' | 'usage' | 'error' | 'completed' | string;
	data: Record<string, unknown> & { content?: string; tool_name?: string };
	metadata?: { agent_name?: string };
};

export class AssistantError extends Error {
	status: number;

	constructor(message: string, status: number) {
		super(message);
		this.name = 'AssistantError';
		this.status = status;
	}
}

const STREAM_PATH = '/api/integrated-ai/stream';
const MESSAGES_COLLECTION = '_integratedAiMessages';
const IMAGES_COLLECTION = '_integratedAiImages';
const FILE_PATH_PATTERN = /\/api\/files\/[^/]+\/([^/?#]+)\/([^/?#]+)/;
const FILE_TOKEN_TTL_MS = 90_000;

type StoredBlock = { type: 'text'; text: string } | { type: 'image'; image: string };

type StoredEvent = {
	type: string;
	data: Record<string, unknown> & { content?: string; tool_name?: string; tool_call_id?: string };
};

type StoredMessage = { role: 'user' | 'assistant'; content: StoredBlock[] | StoredEvent[] };

let fileToken: { value: string; issuedAt: number } | null = null;
let pendingFileToken: Promise<string> | null = null;

const currentFileToken = async (): Promise<string> => {
	if (fileToken && Date.now() - fileToken.issuedAt < FILE_TOKEN_TTL_MS) {
		return fileToken.value;
	}

	pendingFileToken ??= pb.files
		.getToken()
		.then((token) => {
			fileToken = { value: token, issuedAt: Date.now() };

			return token;
		})
		.finally(() => {
			pendingFileToken = null;
		});

	return pendingFileToken;
};

/**
 * Stored images are protected files, so a bare URL renders as a broken image —
 * every reference has to be signed with a short-lived token before use. Anything
 * that is not a PocketBase file reference is returned unchanged.
 */
export const signImageUrl = async (reference: string): Promise<string> => {
	const match = reference?.match(FILE_PATH_PATTERN);

	if (!match) {
		return reference;
	}

	const [, recordId, filename] = match;

	return pb.files.getURL({ id: recordId, collectionName: IMAGES_COLLECTION }, filename, {
		token: await currentFileToken(),
	});
};

const signAll = async (references: string[]): Promise<string[]> =>
	Promise.all(references.map(reference => signImageUrl(reference).catch(() => reference)));

const authHeader = (): Record<string, string> =>
	pb.authStore.isValid ? { Authorization: `Bearer ${pb.authStore.token}` } : {};

const errorFrom = async (response: Response): Promise<AssistantError> => {
	const body = await response.text().catch(() => '');

	try {
		const parsed = JSON.parse(body) as { error?: string; message?: string };

		return new AssistantError(parsed.error ?? parsed.message ?? `Request failed (${response.status})`, response.status);
	} catch {
		return new AssistantError(body || `Request failed (${response.status})`, response.status);
	}
};

/**
 * Sends one turn and resolves when the answer is complete.
 *
 * Text arrives through `onText` a fragment at a time — append it to the message
 * being rendered. Generated images arrive through `onImage`, already signed.
 *
 * A 401 means the visitor must sign in, a 403 that their email is unverified,
 * and a 429 that they are sending too fast; show `error.message` for each rather
 * than a generic failure. Aborting via `signal` rejects with an `AbortError`,
 * which is expected and should not be surfaced as an error.
 *
 * @example
 * await sendMessage({
 *   text: input,
 *   images: files,
 *   onText: chunk => setDraft(previous => previous + chunk),
 *   onImage: url => setImages(previous => [...previous, url]),
 * });
 */
export const sendMessage = async ({
	text,
	images = [],
	onText,
	onImage,
	onEvent,
	signal,
}: {
	text: string;
	images?: File[];
	onText?: (chunk: string) => void;
	onImage?: (url: string) => void;
	onEvent?: (event: AssistantStreamEvent) => void;
	signal?: AbortSignal;
}): Promise<ChatMessage> => {
	const form = new FormData();

	form.append('message', JSON.stringify([{ type: 'text', text }]));
	images.forEach(image => form.append('images', image));

	const response = await fetch(STREAM_PATH, {
		method: 'POST',
		headers: { Accept: 'text/event-stream', ...authHeader() },
		body: form,
		signal,
	});

	if (!response.ok || !response.body) {
		throw await errorFrom(response);
	}

	const reader = response.body.getReader();
	const decoder = new TextDecoder();
	const answer: ChatMessage = { role: 'assistant', content: '' };
	let buffer = '';

	const handle = async (event: AssistantStreamEvent) => {
		onEvent?.(event);

		if (event.type === 'error') {
			throw new AssistantError(String(event.data.content ?? 'The assistant failed to answer'), 502);
		}

		if (event.type === 'content' && typeof event.data.content === 'string') {
			answer.content += event.data.content;
			onText?.(event.data.content);
		}

		if (event.type === 'tool_result' && event.data.tool_name === 'generate_image' && event.data.content) {
			const url = await signImageUrl(String(event.data.content));

			answer.images = [...(answer.images ?? []), url];
			onImage?.(url);
		}
	};

	for (;;) {
		const { done, value } = await reader.read();

		if (done) {
			break;
		}

		buffer += decoder.decode(value, { stream: true });

		const frames = buffer.split('\n\n');
		buffer = frames.pop() ?? '';

		for (const frame of frames) {
			const payload = frame
				.split('\n')
				.filter(line => line.startsWith('data: '))
				.map(line => line.slice('data: '.length))
				.join('');

			if (!payload || payload === '[DONE]') {
				continue;
			}

			const event = JSON.parse(payload) as AssistantStreamEvent;

			if (event.type === 'completed') {
				return answer;
			}

			await handle(event);
		}
	}

	return answer;
};

const generatedImagesOf = (message: StoredEvent[]): string[] =>
	message
		.filter(event => event.type === 'tool_result' && event.data.tool_name === 'generate_image')
		.map(event => String(event.data.content ?? ''))
		.filter(Boolean);

const textOf = (message: StoredEvent[]): string =>
	message
		.filter(event => event.type === 'content')
		.map(event => String(event.data.content ?? ''))
		.join('');

/**
 * The signed-in visitor's transcript, oldest first, with every image signed and
 * ready to render. Empty for anonymous visitors — history is per account.
 *
 * @example
 * useEffect(() => { loadChatHistory().then(setMessages); }, []);
 */
export const loadChatHistory = async (): Promise<ChatMessage[]> => {
	if (!pb.authStore.isValid) {
		return [];
	}

	const records = await pb.collection(MESSAGES_COLLECTION).getFullList<StoredMessage>({ sort: 'created' });

	return Promise.all(
		records.map(async (record) => {
			if (record.role === 'user') {
				const blocks = (record.content as StoredBlock[]) ?? [];
				const images = blocks
					.filter((block): block is Extract<StoredBlock, { type: 'image' }> => block.type === 'image')
					.map(block => block.image);

				return {
					role: 'user' as const,
					content: blocks
						.filter((block): block is Extract<StoredBlock, { type: 'text' }> => block.type === 'text')
						.map(block => block.text)
						.join('\n'),
					...(images.length > 0 && { images: await signAll(images) }),
				};
			}

			const events = (record.content as StoredEvent[]) ?? [];
			const images = generatedImagesOf(events);

			return {
				role: 'assistant' as const,
				content: textOf(events),
				...(images.length > 0 && { images: await signAll(images) }),
			};
		}),
	);
};

/**
 * Deletes the visitor's stored transcript for good. Clearing local state alone
 * only hides it until the next reload.
 */
export const clearChatHistory = async (): Promise<void> => {
	if (!pb.authStore.isValid) {
		return;
	}

	const records = await pb.collection(MESSAGES_COLLECTION).getFullList<{ id: string }>({ fields: 'id' });

	await Promise.all(records.map(record => pb.collection(MESSAGES_COLLECTION).delete(record.id)));
};
