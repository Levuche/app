import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { PageLayouts } from '@levuche/ui';
import { CreatorPage } from '@/components/creator-page';
import { pageBlocks } from '@/components/page-blocks';
import { siteAddress } from '@/lib/handle';
import { REPORT_REASONS, reportCopy } from '@/lib/moderation';
import { database } from '@/lib/sites';
import { requireStaff } from '@/lib/staff-session';

type Props = { params: Promise<{ id: string }> };

export const metadata: Metadata = {
  title: 'Reported page',
  referrer: 'no-referrer',
};

/**
 * The copy of a site a report was made against (#33), as visitors saw it
 * then: the reported page, or the home page if that page is gone. Staff
 * only.
 */
export default async function ReportedPage({ params }: Props) {
  await requireStaff();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const copy = await reportCopy(await database(), id);
  if (!copy) notFound();
  const page =
    copy.snapshot.pages.find((one) => one.path === copy.path) ??
    copy.snapshot.pages.find((one) => one.path === '');

  return (
    <div className="flex flex-col">
      <div
        role="note"
        className="bg-lv-surface-2 text-lv-text px-gutter flex flex-col gap-1 py-3 text-sm"
      >
        <p className="m-0 font-semibold">
          {siteAddress(copy.handle)}
          {copy.path ? `/${copy.path}` : ''}, version {copy.version}, as
          reported for {REPORT_REASONS[copy.reason].toLowerCase()}.
        </p>
        <Link
          href="/staff"
          className="text-lv-link font-semibold underline-offset-4 hover:underline"
        >
          Back to reports
        </Link>
      </div>
      {page ? (
        // Back to the size the page has on levuche.page, out of the app's.
        <div className="text-base">
          <CreatorPage
            blocks={pageBlocks(page.blocks)}
            frame={page.frame}
            layouts={page.layouts as PageLayouts}
          />
        </div>
      ) : (
        <p className="px-gutter">This copy has no page to show.</p>
      )}
    </div>
  );
}
