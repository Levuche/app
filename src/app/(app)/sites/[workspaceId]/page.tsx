import type { Metadata } from 'next';
import Link from 'next/link';
import { CopyAddress } from '@/components/copy-address';
import { OpenSiteSettings } from '@/components/site-switcher';
import { BILLING_VIEW } from '@/lib/billing';
import { hasDraftChanges } from '@/lib/db';
import { siteAddress } from '@/lib/handle';
import { buttonClasses } from '@/lib/button';
import { pauseNotice } from '@/lib/moderation';
import { SITE_STATUS } from '@/lib/site-status';
import { setSiteOffline } from './actions';
import { PausedNotice } from './paused-notice';
import { database, getSite, SITE_EDIT } from '@/lib/sites';

type Props = { params: Promise<{ workspaceId: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return { title: (await getSite((await params).workspaceId)).site.name };
}

const ROLES: Record<string, string> = {
  admin: 'an admin',
  editor: 'an editor',
  viewer: 'a viewer',
};

/**
 * A site's overview: its status, its address with a way to copy it, taking
 * it offline and back (admins), editing (#20) and publishing (#21), and who
 * you are on it. Stats come later (#27).
 */
export default async function SitePage({ params }: Props) {
  const { site, role, can } = await getSite((await params).workspaceId);
  const address = siteAddress(site.handle);
  const status =
    SITE_STATUS[site.status === 'deleted' ? 'offline' : site.status];
  const paused =
    site.status === 'paused'
      ? await pauseNotice(await database(), site.workspaceId, site.id)
      : null;

  return (
    <main className="px-gutter max-w-layout py-page mx-auto flex w-full flex-1 flex-col gap-5">
      <h1 className="text-title m-0 break-words">{site.name}</h1>
      {paused ? (
        <PausedNotice
          workspaceId={site.workspaceId}
          notice={paused}
          canAppeal={can(SITE_EDIT)}
        />
      ) : null}

      <section
        aria-labelledby="site-card"
        className="bg-lv-card border-lv-border rounded-box p-box flex flex-col gap-4 border-2"
      >
        <h2 id="site-card" className="sr-only">
          Your site
        </h2>
        <div className="flex flex-col gap-1">
          <p className="m-0 flex flex-wrap items-center gap-2">
            <span
              data-status={site.status}
              className={
                site.status === 'live'
                  ? 'bg-lv-success-bg text-lv-success rounded-full px-3 py-1 text-sm font-bold'
                  : 'bg-lv-surface-2 text-lv-text rounded-full px-3 py-1 text-sm font-bold'
              }
            >
              {site.status === 'live' && site.liveVersion !== null
                ? `${status.label}, version ${site.liveVersion}`
                : status.label}
            </span>
            {site.liveVersion !== null && hasDraftChanges(site) ? (
              <span
                data-draft-changes
                className="bg-lv-surface-2 text-lv-text rounded-full px-3 py-1 text-sm font-bold"
              >
                Draft has changes
              </span>
            ) : null}
          </p>
          <p className="text-lv-text-2 m-0">{status.detail}</p>
        </div>
        <div className="flex flex-col gap-2">
          <p className="m-0 font-semibold">Your link</p>
          <p className="m-0 text-base font-semibold break-all">
            {site.status === 'live' ? (
              <a
                href={`https://${address}`}
                target="_blank"
                rel="noopener"
                className="text-lv-link underline-offset-4 hover:underline"
              >
                {address}
              </a>
            ) : (
              address
            )}
          </p>
          <CopyAddress address={address} />
        </div>
        {role === 'admin' &&
          (site.status === 'live' || site.status === 'offline') && (
            <form action={setSiteOffline} className="flex flex-col gap-2">
              <input
                type="hidden"
                name="workspaceId"
                value={site.workspaceId}
              />
              <input
                type="hidden"
                name="offline"
                value={String(site.status === 'live')}
              />
              <button
                type="submit"
                className={buttonClasses('outline', 'self-start')}
              >
                {site.status === 'live' ? 'Take offline' : 'Put back online'}
              </button>
              <p className="text-lv-text-2 m-0 text-sm">
                {site.status === 'live'
                  ? 'Visitors see that your page isn’t available until you put it back. Nothing is deleted.'
                  : 'Your last published version goes live again at the same link.'}
              </p>
            </form>
          )}
      </section>

      <p className="m-0">
        You&apos;re {ROLES[role] ?? `a ${role}`} on this site.
        {!can(SITE_EDIT) && ' You can look at it, but not change it.'}
      </p>
      {can(SITE_EDIT) ? (
        <Link
          href={`/sites/${site.workspaceId}/edit`}
          className={buttonClasses('primary', 'self-start')}
        >
          Edit your page
        </Link>
      ) : null}
      <Link
        href={`/sites/${site.workspaceId}/publish`}
        className={buttonClasses(
          can(SITE_EDIT) ? 'outline' : 'quiet',
          'self-start'
        )}
      >
        {can(SITE_EDIT) ? 'Publish' : 'Versions'}
      </Link>
      <OpenSiteSettings billing={can(BILLING_VIEW)} />
      {/* Until the dashboard's menu has its own place for it (R2). */}
      <Link
        href="/new"
        className="text-lv-link self-start font-semibold underline-offset-4 hover:underline"
      >
        Make another site
      </Link>
    </main>
  );
}
