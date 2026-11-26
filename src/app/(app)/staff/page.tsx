import type { Metadata } from 'next';
import Link from 'next/link';
import { buttonClasses } from '@/lib/button';
import { siteAddress } from '@/lib/handle';
import {
  MAX_NOTE,
  moderationLog,
  openReports,
  pausedSites,
  REPORT_REASONS,
  type ReportReason,
} from '@/lib/moderation';
import { database } from '@/lib/sites';
import { requireStaff } from '@/lib/staff-session';
import { close, pause, unpause } from './actions';

export const metadata: Metadata = { title: 'Reports and pauses' };

type Props = { searchParams: Promise<{ done?: string }> };

const DONE: Record<string, string> = {
  paused: 'The site is paused. Its creator sees why.',
  unpaused: 'The site is back as it was before the pause.',
  closed: 'Those reports are closed. The site stays up.',
  'no-reason': 'Choose a reason to pause the site.',
  'not-changed':
    'Nothing changed: someone may have got there first. Reload to see.',
};

const ACTIONS = {
  pause: 'Paused',
  unpause: 'Unpaused',
  close: 'Closed reports',
  appeal: 'Creator asked to look again',
};

const when = (iso: string | null) =>
  iso
    ? `${new Date(iso).toLocaleString('en-GB', {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: 'UTC',
      })} UTC`
    : 'unknown';

const link = 'text-lv-link font-semibold underline-offset-4 hover:underline';
const card =
  'bg-lv-card border-lv-border rounded-box p-box flex flex-col gap-4 border-2';
const field =
  'border-lv-border bg-lv-bg text-lv-text rounded-xl border-2 p-3 font-[inherit]';

const reasonWords = (reason: ReportReason | null) =>
  reason ? REPORT_REASONS[reason] : 'No reason given';

/**
 * The Levuche team's screen (#33): open reports by site, with the copy each
 * report was made against, pausing and unpausing, and the log of what was
 * done. "Not found" for anyone who isn't staff (src/lib/staff.ts).
 */
export default async function StaffPage({ searchParams }: Props) {
  await requireStaff();
  const { done } = await searchParams;
  const db = await database();
  const [reported, paused, log] = await Promise.all([
    openReports(db),
    pausedSites(db),
    moderationLog(db),
  ]);

  return (
    <main className="px-gutter max-w-layout py-page mx-auto flex w-full flex-1 flex-col gap-6">
      <h1 className="text-title m-0">Reports and pauses</h1>
      <p role="status" className="m-0 font-semibold empty:hidden">
        {done ? (DONE[done] ?? null) : null}
      </p>

      <section aria-labelledby="reported" className="flex flex-col gap-4">
        <h2 id="reported" className="text-section m-0">
          Open reports
        </h2>
        {reported.length === 0 ? (
          <p className="m-0">No open reports.</p>
        ) : (
          reported.map((site) => (
            <article
              key={site.siteId}
              data-reported={site.handle}
              aria-labelledby={`site-${site.siteId}`}
              className={card}
            >
              <h3
                id={`site-${site.siteId}`}
                className="text-item m-0 break-all"
              >
                {siteAddress(site.handle)}{' '}
                <span className="text-lv-text-2 text-sm font-normal">
                  {site.reports.length === 1
                    ? '1 report'
                    : `${site.reports.length} reports`}
                  , {site.status}
                </span>
              </h3>
              <ul className="m-0 flex flex-col gap-3 pl-5">
                {site.reports.map((report) => (
                  <li key={report.id}>
                    <span className="font-semibold">
                      {REPORT_REASONS[report.reason]}
                    </span>{' '}
                    on {report.path ? `/${report.path}` : 'the home page'},{' '}
                    {when(report.createdAt)}.{' '}
                    <Link href={`/staff/reports/${report.id}`} className={link}>
                      See version {report.version} as reported
                    </Link>
                    {report.details ? (
                      <p className="m-0 mt-1 break-words whitespace-pre-line">
                        {report.details}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
              <form action={pause} className="flex flex-col gap-3">
                <input type="hidden" name="siteId" value={site.siteId} />
                <div className="flex flex-col gap-2">
                  <label
                    htmlFor={`reason-${site.siteId}`}
                    className="font-semibold"
                  >
                    Reason the creator sees
                  </label>
                  <select
                    id={`reason-${site.siteId}`}
                    name="reason"
                    required
                    defaultValue={site.reports[0]?.reason}
                    className={field}
                  >
                    {Object.entries(REPORT_REASONS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-2">
                  <label
                    htmlFor={`pause-note-${site.siteId}`}
                    className="font-semibold"
                  >
                    Note to the creator (optional)
                  </label>
                  <textarea
                    id={`pause-note-${site.siteId}`}
                    name="note"
                    rows={2}
                    maxLength={MAX_NOTE}
                    className={field}
                  />
                </div>
                <button
                  type="submit"
                  className={buttonClasses('primary', 'self-start')}
                >
                  Pause {site.handle}
                </button>
              </form>
              <form action={close} className="flex flex-col gap-3">
                <input type="hidden" name="siteId" value={site.siteId} />
                <div className="flex flex-col gap-2">
                  <label
                    htmlFor={`close-note-${site.siteId}`}
                    className="font-semibold"
                  >
                    Why it stays up (for the log, optional)
                  </label>
                  <input
                    id={`close-note-${site.siteId}`}
                    name="note"
                    maxLength={MAX_NOTE}
                    className={field}
                  />
                </div>
                <button
                  type="submit"
                  className={buttonClasses('outline', 'self-start')}
                >
                  Close reports, keep it up
                </button>
              </form>
            </article>
          ))
        )}
      </section>

      <section aria-labelledby="paused" className="flex flex-col gap-4">
        <h2 id="paused" className="text-section m-0">
          Paused sites
        </h2>
        {paused.length === 0 ? (
          <p className="m-0">No sites are paused.</p>
        ) : (
          paused.map((site) => (
            <article
              key={site.siteId}
              data-paused={site.handle}
              aria-labelledby={`paused-${site.siteId}`}
              className={card}
            >
              <h3
                id={`paused-${site.siteId}`}
                className="text-item m-0 break-all"
              >
                {siteAddress(site.handle)}
              </h3>
              <p className="m-0">
                {reasonWords(site.reason)}, paused {when(site.pausedAt)}.
                {site.note ? ` Note: ${site.note}` : ''}
              </p>
              {site.appeal ? (
                <p
                  data-appeal
                  className="bg-lv-surface-2 m-0 rounded-xl p-3 break-words whitespace-pre-line"
                >
                  <span className="font-semibold">
                    The creator asked to look again, {when(site.appeal.at)}:
                  </span>{' '}
                  {site.appeal.note}
                </p>
              ) : null}
              <form action={unpause} className="flex flex-col gap-3">
                <input type="hidden" name="siteId" value={site.siteId} />
                <div className="flex flex-col gap-2">
                  <label
                    htmlFor={`unpause-note-${site.siteId}`}
                    className="font-semibold"
                  >
                    Why (for the log, optional)
                  </label>
                  <input
                    id={`unpause-note-${site.siteId}`}
                    name="note"
                    maxLength={MAX_NOTE}
                    className={field}
                  />
                </div>
                <button
                  type="submit"
                  className={buttonClasses('outline', 'self-start')}
                >
                  Unpause {site.handle}
                </button>
              </form>
            </article>
          ))
        )}
      </section>

      <section aria-labelledby="log" className="flex flex-col gap-4">
        <h2 id="log" className="text-section m-0">
          Log
        </h2>
        {log.length === 0 ? (
          <p className="m-0">Nothing yet.</p>
        ) : (
          <ol className="m-0 flex flex-col gap-2 pl-5">
            {log.map((entry) => (
              <li key={entry.id} data-log={entry.action}>
                <span className="font-semibold">{ACTIONS[entry.action]}</span>{' '}
                {entry.handle || 'a removed site'}
                {entry.reason ? ` (${REPORT_REASONS[entry.reason]})` : ''},{' '}
                {when(entry.at)}, by {entry.actor}
                {entry.note ? `: ${entry.note}` : ''}
              </li>
            ))}
          </ol>
        )}
      </section>
    </main>
  );
}
