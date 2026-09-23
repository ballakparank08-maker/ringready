import type { Route } from './+types/home';
import { CtaBand } from '@/components/home/cta-band';
import { Hero } from '@/components/home/hero';
import { HowItWorks } from '@/components/home/how-it-works';
import { ScenarioGrid } from '@/components/home/scenario-grid';
import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';
import { seo } from '@/lib/seo';

export function meta({ matches, location }: Route.MetaArgs) {
	return seo({ matches, location }, {
		title: 'RingReady — Practice real phone calls with an AI voice',
		description:
			'Rehearse interviews, negotiations and everyday calls out loud. RingReady puts a lifelike AI voice on the other end of the line, with live transcripts and instant redial.',
		image: '/logo.png',
	});
}

export default function HomePage() {
	return (
		<div className="min-h-dvh bg-background">
			<SiteHeader />
			<main>
				<Hero />
				<ScenarioGrid />
				<HowItWorks />
				<CtaBand />
			</main>
			<SiteFooter />
		</div>
	);
}
