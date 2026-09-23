import { Link, useParams } from 'react-router';
import { ArrowLeft } from 'lucide-react';
import type { Route } from './+types/call.$scenarioId';
import { CallScreen } from '@/components/call/call-screen';
import { getScenario } from '@/data/scenarios';
import { requireAuth } from '@/lib/require-auth';
import { seo } from '@/lib/seo';

export function meta({ matches, location, params }: Route.MetaArgs) {
	const scenario = getScenario(params.scenarioId);

	return seo({ matches, location }, {
		title: scenario ? `${scenario.title} — RingReady practice call` : 'Practice call — RingReady',
		description: scenario?.tagline ?? 'Practice a real phone call with a lifelike AI voice.',
	});
}

export const clientLoader = () => {
	return null;
};
clientLoader.hydrate = true as const;

export function HydrateFallback() {
	return <div className="min-h-dvh bg-background" />;
}

export default function CallRoute() {
	const { scenarioId } = useParams();
	const scenario = getScenario(scenarioId);

	if (!scenario) {
		return (
			<div className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-background px-5 text-center">
				<p className="font-mono text-[11px] tracking-[0.3em] text-primary uppercase">Unknown scenario</p>
				<h1 className="font-display text-4xl font-bold tracking-tight">That line doesn’t exist.</h1>
				<Link
					to="/"
					className="flex h-12 items-center gap-2 border border-border px-6 font-mono text-sm tracking-widest uppercase transition-colors hover:border-primary hover:text-primary"
				>
					<ArrowLeft className="h-4 w-4" />
					Back to scenarios
				</Link>
			</div>
		);
	}

	return <CallScreen key={scenario.id} scenario={scenario} />;
}
