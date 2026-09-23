import { type RouteConfig, index, route } from '@react-router/dev/routes';

export default [
	index('routes/home.tsx'),
	route('auth', 'routes/auth.tsx'),
	route('call/:scenarioId', 'routes/call.$scenarioId.tsx'),
	route('sitemap.xml', 'routes/sitemap.xml.ts'),
	route('robots.txt', 'routes/robots.txt.ts'),
	route('api/health', 'routes/api.health.ts'),
	route('api/integrated-ai/stream', 'routes/api.integrated-ai.stream.ts'),
	route('hcgi/platform/*', 'routes/hcgi.platform.$.ts'),
	route('api/*', 'routes/api.$.ts'),
] satisfies RouteConfig;
