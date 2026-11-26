import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { PageShell } from '@/components/page-shell';
import { buttonClasses } from '@/lib/button';
import { isHandle, siteAddress } from '@/lib/handle';
import {
  MAX_DETAILS,
  REPORT_REASONS,
  reportableSite,
  type ReportResult,
} from '@/lib/moderation';
import { database } from '@/lib/sites';
import { sendReport } from './actions';

type Props = {
  params: Promise<{ handle: string }>;
  searchParams: Promise<{ done?: string; page?: string }>;
};

export const metadata: Metadata = {
  title: 'Report a page',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

const DONE: Record<ReportResult | 'no-reason', string> = {
  sent: 'Thanks. Your report reached the Levuche team, and we’ll look at it.',
  again: 'You’ve already reported this page today. The Levuche team has it.',
  limited:
    'You’ve sent a lot of reports today. Try again tomorrow, or write to the Levuche team.',
  'not-found': 'This page isn’t live, so there’s nothing to report.',
  'no-reason': 'Choose what’s wrong with the page.',
};

const link = 'text-lv-link font-semibold underline-offset-4 hover:underline';

/**
 * Reporting a creator site (#33): linked from the foot of every live site
 * on levuche.page. Anyone can report, signed in or not.
 */
export default async function ReportPage({ params, searchParams }: Props) {
  const { handle } = await params;
  const { done, page = '' } = await searchParams;
  if (!isHandle(handle)) notFound();
  const site = await reportableSite(await database(), handle);
  const said = done && done in DONE ? DONE[done as keyof typeof DONE] : null;
  const address = siteAddress(handle);
  const finished = done === 'sent' || done === 'again' || done === 'limited';

  if (!site && done !== 'sent')
    return (
      <PageShell>
        <h1 className="text-title-lg m-0">Report a page</h1>
        <p className="m-0">
          There’s no live page at {address}, so there’s nothing to report.
        </p>
      </PageShell>
    );

  return (
    <PageShell>
      <h1 className="text-title-lg m-0">Report a page</h1>
      <p role="status" className="m-0 font-semibold empty:hidden">
        {said}
      </p>
      {finished ? (
        <p className="m-0">
          <a href={`https://${address}`} className={link}>
            Back to {address}
          </a>
        </p>
      ) : (
        <form action={sendReport} className="flex flex-col gap-5">
          <input type="hidden" name="handle" value={handle} />
          <input type="hidden" name="path" value={page.slice(0, 200)} />
          <p className="m-0">
            Tell the Levuche team what’s wrong with{' '}
            <span className="font-semibold break-all">
              {address}
              {page ? `/${page}` : ''}
            </span>
            . You don’t need an account, and the creator won’t see who reported
            it.
          </p>
          <fieldset className="m-0 flex flex-col gap-3 border-0 p-0">
            <legend className="mb-3 p-0 font-semibold">What’s wrong?</legend>
            {Object.entries(REPORT_REASONS).map(([value, label]) => (
              <label key={value} className="flex items-center gap-3">
                <input
                  type="radio"
                  name="reason"
                  value={value}
                  required
                  className="size-5"
                />
                {label}
              </label>
            ))}
          </fieldset>
          <div className="flex flex-col gap-2">
            <label htmlFor="details" className="font-semibold">
              More details (optional)
            </label>
            <textarea
              id="details"
              name="details"
              maxLength={MAX_DETAILS}
              rows={4}
              className="border-lv-border bg-lv-bg text-lv-text rounded-xl border-2 p-3 font-[inherit]"
            />
          </div>
          <button
            type="submit"
            className={buttonClasses('primary', 'self-start')}
          >
            Send report
          </button>
        </form>
      )}
    </PageShell>
  );
}
