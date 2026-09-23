import type { Route } from './+types/hcgi.platform.$';

const POCKETBASE_BACKEND = process.env.POCKETBASE_URL || 'http://127.0.0.1:8090';

export async function loader({ request, params }: Route.LoaderArgs) {
	return handleProxy(request, params['*']);
}

export async function action({ request, params }: Route.ActionArgs) {
	return handleProxy(request, params['*']);
}

async function handleProxy(request: Request, splat: string | undefined) {
	const url = new URL(request.url);
	const targetBase = new URL(POCKETBASE_BACKEND);
	const targetPath = splat ? `/${splat}` : '';
	const targetUrl = new URL(`${targetBase.origin}${targetPath}${url.search}`);

	const headers = new Headers(request.headers);
	headers.set('host', targetBase.host);

	const init: RequestInit = {
		method: request.method,
		headers,
		redirect: 'manual',
	};

	if (request.method !== 'GET' && request.method !== 'HEAD') {
		init.body = await request.arrayBuffer();
		// @ts-expect-error duplex is a valid Node fetch option
		init.duplex = 'half';
	}

	return fetch(targetUrl.toString(), init);
}
