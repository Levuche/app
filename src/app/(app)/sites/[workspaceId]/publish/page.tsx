import type { Metadata } from 'next';
import Link from 'next/link';
import { CopyAddress } from '@/components/copy-address';
import {
  BILLING_MANAGE,
  formatPrice,
  priceWords,
  whyNotForSale,
} from '@/lib/billing';
import { requireUser } from '@/lib/buildbase';
import { buttonClasses } from '@/lib/button';
import { hasDraftChanges, siteStore } from '@/lib/db';
import { siteAddress } from '@/lib/handle';
import { publishProblems } from '@/lib/publish';
import { appUrl } from '@/lib/site';
import { database, getSite, SITE_EDIT, siteAddOn } from '@/lib/sites';
import { buySite, publishSite, rollbackSite, setPreviewLink } from './actions';

type Props = {
  params: Promise<{ workspaceId: string }>;
  searchParams: Promise<{ done?: string | string[] }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { site } = await getSite((await params).workspaceId);
  return { title: `Publish ${site.name}` };
}

const when = (iso: string) =>
  `${new Date(iso).toLocaleString('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'UTC',
  })} UTC`;

const link = 'text-lv-link font-semibold underline-offset-4 hover:underline';

/** What the last action did, from ?done= (set by ./actions.ts). */
function outcome(
  done: string | undefined,
  { offline, paid }: { offline: boolean; paid: boolean }
) {
  const [kind, number] = done?.split(/-(?=\d+$)/) ?? [];
  if (done === 'paid')
    return paid
      ? 'Thanks, your page is bought. Publish it whenever you’re ready.'
      : 'Thanks. Your payment is still being confirmed, so reload this page in a moment.';
  if (done === 'not-paid')
    return 'You didn’t finish paying, so nothing was charged.';
  if (done === 'needs-buying')
    return 'Buy your page first, then it can go live.';
  if (done === 'not-for-sale') return whyNotForSale(null);
  if (done === 'not-bought')
    return 'The checkout didn’t open. Reload the page and try again.';
  if (kind === 'published')
    return offline
      ? `Version ${number} is ready. Your site is offline, so visitors see it once you put it back.`
      : `Version ${number} is live.`;
  if (kind === 'live') return `Version ${number} is live again.`;
  if (done === 'preview-on') return 'Your preview link is on.';
  if (done === 'preview-off') return 'Your preview link is off.';
  if (done === 'not-published')
    return 'That didn’t publish. Reload the page and try again.';
  if (done === 'not-changed')
    return 'That version didn’t go live. Reload the page and try again.';
  return null;
}

/**
 * Publishing a site (#21): the checks its draft has to pass, buying the
 * page before it first goes live (#19), the Publish button with a note, a private preview link to the draft, and the version
 * history with a way to make an older version live again.
 */
export default async function PublishPage({ params, searchParams }: Props) {
  const { workspaceId } = await params;
  const { done } = await searchParams;
  const [{ site, can, paid, memberNames }, user] = await Promise.all([
    getSite(workspaceId),
    requireUser(),
  ]);
  const store = siteStore(await database(), { workspaceId });
  const [draft, versions, token] = await Promise.all([
    store.draft(site.id),
    store.versions(site.id),
    store.previewToken(site.id),
  ]);
  const fixes = draft ? publishProblems(draft) : [];
  const editable = can(SITE_EDIT);
  const canPublish = ['unpublished', 'live', 'offline'].includes(site.status);
  const said = outcome(Array.isArray(done) ? done[0] : done, {
    offline: site.status === 'offline',
    paid,
  });
  const mustBuy = editable && canPublish && !paid && fixes.length === 0;
  const offer = mustBuy ? await siteAddOn(workspaceId) : null;
  const price = offer ? priceWords(offer) : null;
  const cost = offer?.price ? formatPrice(offer.price) : null;
  const previewUrl = token ? `${appUrl}/draft/${token}` : null;
  const hidden = <input type="hidden" name="workspaceId" value={workspaceId} />;
  const who = (id: string) =>
    id === user.id ? 'you' : (memberNames.get(id) ?? 'a teammate');

  return (
    <main className="px-gutter max-w-layout py-page mx-auto flex w-full flex-1 flex-col gap-6">
      <div className="flex flex-col gap-1">
        <Link
          href={`/sites/${workspaceId}`}
          className={`${link} self-start text-sm`}
        >
          Back to {site.name}
        </Link>
        <h1 className="text-title m-0 break-words">Publish</h1>
      </div>

      <p role="status" className="m-0 font-semibold empty:hidden">
        {said}
      </p>
      {!editable ? (
        <p className="m-0">You can look at this site, but not change it.</p>
      ) : null}

      <section aria-labelledby="publish-now" className="flex flex-col gap-4">
        <h2 id="publish-now" className="text-section m-0">
          {fixes.length ? 'Needs a fix' : 'Your draft'}
        </h2>
        {site.status === 'paused' ? (
          <p className="m-0">
            The Levuche team paused this site after a report, so it can&apos;t
            be published.{' '}
            <Link href={`/sites/${workspaceId}`} className={link}>
              See why, and ask us to look again
            </Link>
          </p>
        ) : fixes.length ? (
          <>
            <p className="m-0">
              Fix these, then come back to publish. Nothing changes for visitors
              until you do.
            </p>
            <ul className="m-0 flex flex-col gap-3 pl-5">
              {fixes.map((fix) => (
                <li key={fix.blockId ?? fix.label} data-needs-fix>
                  <span className="font-semibold">{fix.label}:</span>{' '}
                  {fix.problems.join(' ')}{' '}
                  <Link
                    className={link}
                    href={`/sites/${workspaceId}/edit${fix.blockId ? `?block=${fix.blockId}` : ''}`}
                  >
                    Fix {fix.blockId ? fix.label.toLowerCase() : 'it'}
                  </Link>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <>
            <p className="m-0">
              {site.liveVersion === null
                ? 'Your page isn’t live yet. Publishing puts it at your link for anyone to see.'
                : hasDraftChanges(site)
                  ? `Your draft has changes that visitors don’t see yet. Version ${site.liveVersion} is live.`
                  : `Nothing has changed since version ${site.liveVersion}.`}
            </p>
            {mustBuy ? (
              <div
                data-buy
                className="border-lv-border rounded-box p-box flex flex-col gap-3 border-2"
              >
                <h3 className="text-item m-0">Buy your page to publish it</h3>
                <p className="m-0">
                  Building and the preview link are free. Putting your page at{' '}
                  {siteAddress(site.handle)} for everyone to see takes buying it
                  {price ? `: ${price}` : ''}.
                </p>
                {!can(BILLING_MANAGE) ? (
                  <p className="m-0">
                    Ask an admin of this site to buy it. Then you can publish.
                  </p>
                ) : offer?.purchasable && cost ? (
                  <form action={buySite} className="flex flex-col gap-2">
                    {hidden}
                    <button
                      type="submit"
                      className={buttonClasses('primary', 'self-start')}
                    >
                      Buy for {cost}
                    </button>
                    <p className="text-lv-text-2 m-0 text-sm">
                      You pay on a secure checkout page, then come back here to
                      publish. Your receipt is kept under Billing and receipts
                      in your site&apos;s settings.
                    </p>
                  </form>
                ) : (
                  <p className="m-0">{whyNotForSale(offer)}</p>
                )}
              </div>
            ) : editable && canPublish ? (
              <form action={publishSite} className="flex flex-col gap-3">
                {hidden}
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="publish-note" className="font-semibold">
                    Note (optional)
                  </label>
                  <input
                    id="publish-note"
                    name="note"
                    maxLength={200}
                    aria-describedby="publish-note-help"
                    className="min-h-control border-lv-border bg-lv-card text-lv-text w-full max-w-xl rounded-xl border-2 px-3 text-base sm:text-sm"
                  />
                  <p
                    id="publish-note-help"
                    className="text-lv-text-2 m-0 text-sm"
                  >
                    What changed, for your version history.
                  </p>
                </div>
                <button
                  type="submit"
                  className={buttonClasses('primary', 'self-start')}
                >
                  Publish
                </button>
              </form>
            ) : null}
          </>
        )}
      </section>

      <section aria-labelledby="preview-link" className="flex flex-col gap-3">
        <h2 id="preview-link" className="text-section m-0">
          Private preview link
        </h2>
        <p className="m-0">
          Anyone with this link sees your draft, before it&apos;s published.
          Search engines never show it. Turning it off stops the link working.
        </p>
        {previewUrl ? (
          <>
            <p className="m-0 break-all">
              <a
                href={previewUrl}
                target="_blank"
                rel="noopener"
                className={link}
              >
                {previewUrl}
              </a>
            </p>
            <CopyAddress address={previewUrl} url={previewUrl} />
          </>
        ) : null}
        {editable ? (
          <form action={setPreviewLink}>
            {hidden}
            <input type="hidden" name="on" value={String(!previewUrl)} />
            <button type="submit" className={buttonClasses('outline')}>
              {previewUrl
                ? 'Turn off the preview link'
                : 'Turn on a preview link'}
            </button>
          </form>
        ) : null}
      </section>

      <section aria-labelledby="versions" className="flex flex-col gap-3">
        <h2 id="versions" className="text-section m-0">
          Versions
        </h2>
        {versions.length === 0 ? (
          <p className="m-0">Each time you publish, a version is kept here.</p>
        ) : (
          <ol className="m-0 flex list-none flex-col gap-3 p-0">
            {versions.map((version) => {
              const isLive = version.number === site.liveVersion;
              return (
                <li
                  key={version.number}
                  data-version={version.number}
                  className="border-lv-border flex flex-wrap items-center justify-between gap-3 rounded-xl border-2 p-3"
                >
                  <div className="flex flex-col gap-1">
                    <p className="m-0 font-semibold">
                      Version {version.number}
                      {isLive ? (
                        <span className="bg-lv-success-bg text-lv-success ml-2 rounded-full px-3 py-0.5 text-sm font-bold">
                          {site.status === 'offline' ? 'Ready' : 'Live'}
                        </span>
                      ) : null}
                    </p>
                    {version.note ? (
                      <p className="m-0">{version.note}</p>
                    ) : null}
                    <p className="text-lv-text-2 m-0 text-sm">
                      Published by {who(version.publishedBy)},{' '}
                      <time dateTime={version.publishedAt}>
                        {when(version.publishedAt)}
                      </time>
                    </p>
                  </div>
                  {editable &&
                  !isLive &&
                  site.liveVersion !== null &&
                  canPublish ? (
                    <form action={rollbackSite}>
                      {hidden}
                      <input
                        type="hidden"
                        name="number"
                        value={version.number}
                      />
                      <button
                        type="submit"
                        className={buttonClasses('outline')}
                        aria-label={`Make version ${version.number} live`}
                      >
                        Make live
                      </button>
                    </form>
                  ) : null}
                </li>
              );
            })}
          </ol>
        )}
      </section>
    </main>
  );
}
