import { buttonClasses } from '@/lib/button';
import { MAX_NOTE, REPORT_REASONS, type ReportReason } from '@/lib/moderation';
import { askToLookAgain } from './actions';

const when = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', {
    dateStyle: 'long',
    timeZone: 'UTC',
  });

/**
 * Why the Levuche team paused this site (#33), and a way for its admins and
 * editors to ask the team to look again, once per pause.
 */
export function PausedNotice({
  workspaceId,
  notice,
  canAppeal,
}: {
  workspaceId: string;
  notice: {
    reason: ReportReason | null;
    note: string | null;
    pausedAt: string | null;
    appealedAt: string | null;
  };
  canAppeal: boolean;
}) {
  return (
    <section
      aria-labelledby="paused"
      data-paused-notice
      className="bg-lv-surface-2 rounded-card p-card flex flex-col gap-3"
    >
      <h2 id="paused" className="text-h2 m-0">
        The Levuche team paused your site
      </h2>
      <p className="m-0">
        {notice.reason
          ? `Someone reported it, and we paused it for: ${REPORT_REASONS[notice.reason].toLowerCase()}.`
          : 'Someone reported it, and we paused it while we look.'}{' '}
        Visitors see that it isn&apos;t available. Your draft and versions are
        all kept.
      </p>
      {notice.note ? (
        <p className="m-0 break-words whitespace-pre-line">
          <span className="font-semibold">Our note:</span> {notice.note}
        </p>
      ) : null}
      {notice.appealedAt ? (
        <p className="m-0 font-semibold">
          We got your request on {when(notice.appealedAt)}, and we&apos;ll look
          again.
        </p>
      ) : canAppeal ? (
        <form action={askToLookAgain} className="flex flex-col gap-3">
          <input type="hidden" name="workspaceId" value={workspaceId} />
          <label htmlFor="appeal" className="font-semibold">
            If you think this is a mistake, tell us why and we&apos;ll look
            again.
          </label>
          <textarea
            id="appeal"
            name="note"
            required
            rows={3}
            maxLength={MAX_NOTE}
            className="border-lv-border bg-lv-bg text-lv-text rounded-xl border-2 p-3 font-[inherit]"
          />
          <button
            type="submit"
            className={buttonClasses('primary', 'self-start')}
          >
            Ask us to look again
          </button>
        </form>
      ) : (
        <p className="m-0">
          An admin or editor of this site can ask us to look again.
        </p>
      )}
    </section>
  );
}
