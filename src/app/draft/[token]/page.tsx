import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CreatorPage } from '@/components/creator-page';
import { pageBlocks } from '@/components/page-blocks';
import { draftByPreviewToken } from '@/lib/db';
import { siteAddress } from '@/lib/handle';
import { database } from '@/lib/sites';

type Props = { params: Promise<{ token: string }> };

// A private link: never indexed, never cached, and the token isn't sent on
// as a referrer when a visitor follows a link on the page.
export const metadata: Metadata = {
  title: 'Draft preview',
  robots: { index: false, follow: false, nocache: true },
  referrer: 'no-referrer',
};

/**
 * A site's draft at its private preview link (#21), for anyone with the
 * link, signed in or not. It shows the home page as it would go live:
 * blocks still being filled in are left out.
 */
export default async function DraftPreview({ params }: Props) {
  const { token } = await params;
  const found = await draftByPreviewToken(await database(), token);
  const home = found?.draft.pages.find((page) => page.path === '');
  if (!found || !home) notFound();

  return (
    <>
      <p
        role="note"
        className="bg-lv-surface-2 text-lv-text m-0 px-4 py-2 text-center text-sm font-semibold"
      >
        A preview of {siteAddress(found.handle)} before it&apos;s published.
      </p>
      <CreatorPage blocks={pageBlocks(home.blocks)} frame={home.frame} />
    </>
  );
}
