import type { Metadata } from 'next';
import Link from 'next/link';
import { CreatorPage } from '@/components/creator-page';
import {
  DEFAULT_PAGE_FRAME,
  PAGE_FRAMES,
  readPageFrame,
  type PageFrame,
} from '@/lib/page-layout';
import { SAMPLE_BLOCKS } from './sample-page';

export const metadata: Metadata = { title: 'Page preview' };

const FRAME_NAMES: Record<PageFrame, string> = {
  beside: 'Profile beside the grid',
  column: 'One column',
};

const LINK_CLASSES = {
  current:
    'bg-lv-primary text-lv-on-primary min-h-control rounded-tile inline-flex items-center px-3 text-sm font-semibold',
  other:
    'text-lv-link min-h-control rounded-tile inline-flex items-center px-3 text-sm font-semibold underline-offset-4 hover:underline',
};

type Scheme = 'light' | 'dark';

/** The preview's address for a frame and a creator colour scheme. */
function previewHref(frame: PageFrame, scheme: Scheme) {
  const params = new URLSearchParams();
  if (frame !== DEFAULT_PAGE_FRAME) params.set('layout', frame);
  if (scheme === 'dark') params.set('scheme', 'dark');
  const query = params.toString();
  return query ? `/preview?${query}` : '/preview';
}

/**
 * A sample creator's page, to see how each page layout looks on a phone, a
 * tablet and a desktop. `?layout=column` shows the one-column frame and
 * `?scheme=dark` the creator's dark colours. The page editor will show a
 * creator's own page the same way.
 */
export default async function PreviewPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const frame = readPageFrame(params.layout);
  const scheme: Scheme = params.scheme === 'dark' ? 'dark' : 'light';

  return (
    <>
      <nav
        aria-label="Page layout"
        className="border-lv-border px-gutter flex flex-wrap items-center gap-x-4 gap-y-2 border-b py-2"
      >
        <p className="text-lv-text-2 m-0 text-sm font-semibold">
          Sample page layout
        </p>
        <ul className="m-0 flex list-none flex-wrap gap-1 p-0">
          {PAGE_FRAMES.map((option) => {
            const current = option === frame;
            return (
              <li key={option}>
                <Link
                  href={previewHref(option, scheme)}
                  aria-current={current ? 'page' : undefined}
                  className={LINK_CLASSES[current ? 'current' : 'other']}
                >
                  {FRAME_NAMES[option]}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <CreatorPage blocks={SAMPLE_BLOCKS} frame={frame} theme={{ scheme }} />
    </>
  );
}
