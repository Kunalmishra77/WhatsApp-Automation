import type { Metadata } from 'next';
import { ReferralForm } from './ReferralForm';

export const metadata: Metadata = {
  title: "You've been referred",
  description: 'A friend referred you — claim your welcome reward.',
};

type Params = { params: Promise<{ code: string }> };

export default async function ReferralLandingPage({ params }: Params) {
  const { code } = await params;
  return <ReferralForm code={code} />;
}
