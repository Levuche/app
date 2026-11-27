import type { Metadata } from 'next';
import Link from 'next/link';
import {
  ExternalIcon,
  PencilIcon,
  PlusIcon,
  PowerIcon,
  PublishIcon,
} from '@/components/app-icons';
import { CopyAddress } from '@/components/copy-address';
import { IconLink } from '@/components/icon-button';
import { OpenSiteSettings } from '@/components/site-switcher';
import { BILLING_VIEW } from '@/lib/billing';
import { hasDraftChanges, siteStore } from '@/lib/db';
import { siteAddress } from '@/lib/handle';
import { buttonClasses } from '@/lib/button';
import { pauseNotice } from '@/lib/moderation';
import { SITE_STATUS } from '@/lib/site-status';
import { setSiteOffline } from './actions';
import { PagePreview } from './page-preview';
import { PausedNotice } from './paused-notice';
import { database, getSite, SITE_EDIT } from '@/lib/sites';

type Props = { params: Promise<{ workspaceId: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return { title: (await getSite((await params).workspaceId)).site.name };
}

const card =
  'bg-lv-card border-lv-border rounded-box p-box flex flex-col gap-3 border-2';

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

  const store = siteStore(await database(), {
    workspaceId: site.workspaceId,
  });
  const home = (await store.pages(site.id)).find((page) => page.isHome);
  const blocks = home ? await store.blocks(home.id) : [];
  const live = site.status === 'live';
  const badge =
    'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-bold';

  return (
    <main className="px-gutter max-w-layout py-page mx-auto flex w-full flex-1 flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-2">
          <h1 className="text-title m-0 break-words">{site.name}</h1>
          <p className="m-0 flex flex-wrap items-center gap-2">
            <span
              data-status={site.status}
              className={
                live
                  ? `${badge} bg-lv-success-bg text-lv-success`
                  : `${badge} bg-lv-surface-2 text-lv-text`
              }
            >
              {live && site.liveVersion !== null
                ? `${status.label}, version ${site.liveVersion}`
                : status.label}
            </span>
            {site.liveVersion !== null && hasDraftChanges(site) ? (
              <span
                data-draft-changes
                className={`${badge} bg-lv-accent-soft text-lv-on-accent-soft`}
              >
                Draft has changes
              </span>
            ) : null}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {can(SITE_EDIT) ? (
            <Link
              href={`/sites/${site.workspaceId}/edit`}
              className={buttonClasses('primary')}
            >
              <PencilIcon />
              Edit your page
            </Link>
          ) : null}
          <Link
            href={`/sites/${site.workspaceId}/publish`}
            className={buttonClasses(can(SITE_EDIT) ? 'outline' : 'quiet')}
          >
            <PublishIcon />
            {can(SITE_EDIT) ? 'Publish' : 'Versions'}
          </Link>
        </div>
      </div>

      {paused ? (
        <PausedNotice
          workspaceId={site.workspaceId}
          notice={paused}
          canAppeal={can(SITE_EDIT)}
        />
      ) : null}

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="flex min-w-0 flex-col gap-5">
          <section aria-labelledby="site-link" className={card}>
            <h2 id="site-link" className="text-item m-0">
              Your link
            </h2>
            <div className="border-lv-border bg-lv-surface flex flex-wrap items-center gap-2 rounded-xl border-2 py-1.5 ps-3 pe-1.5">
              <p className="m-0 min-w-0 flex-1 text-base font-semibold break-all">
                {live ? (
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
              <span className="flex items-center gap-1">
                {live ? (
                  <IconLink
                    href={`https://${address}`}
                    external
                    label="Open your page"
                    look="outline"
                    icon={<ExternalIcon />}
                  />
                ) : null}
                <CopyAddress address={address} compact />
              </span>
            </div>
            <p className="text-lv-text-2 m-0">{status.detail}</p>
          </section>

          <section
            aria-labelledby="site-settings"
            className={`${card} sm:flex-row sm:items-center sm:justify-between`}
          >
            <div className="flex flex-col gap-1">
              <h2 id="site-settings" className="text-item m-0">
                Settings
              </h2>
              <p className="text-lv-text-2 m-0 text-sm">
                You&apos;re {ROLES[role] ?? `a ${role}`} on this site.
                {!can(SITE_EDIT) && ' You can look at it, but not change it.'}
              </p>
            </div>
            <OpenSiteSettings billing={can(BILLING_VIEW)} />
          </section>

          {role === 'admin' && (live || site.status === 'offline') && (
            <form
              action={setSiteOffline}
              aria-labelledby="site-visibility"
              className={`${card} sm:flex-row sm:items-center sm:justify-between`}
            >
              <input
                type="hidden"
                name="workspaceId"
                value={site.workspaceId}
              />
              <input type="hidden" name="offline" value={String(live)} />
              <div className="flex flex-col gap-1">
                <h2 id="site-visibility" className="text-item m-0">
                  {live ? 'Take your page down' : 'Bring your page back'}
                </h2>
                <p className="text-lv-text-2 m-0 text-sm">
                  {live
                    ? 'Visitors see that your page isn’t available until you put it back. Nothing is deleted.'
                    : 'Your last published version goes live again at the same link.'}
                </p>
              </div>
              <button
                type="submit"
                className={buttonClasses(
                  live ? 'danger' : 'outline',
                  'shrink-0 self-start sm:self-auto'
                )}
              >
                <PowerIcon />
                {live ? 'Take offline' : 'Put back online'}
              </button>
            </form>
          )}
        </div>

        <aside
          aria-label="Preview"
          className="hidden flex-col gap-3 lg:sticky lg:top-4 lg:flex"
        >
          <p className="text-lv-text-2 m-0 text-sm">
            Your draft, as it looks on a phone.
          </p>
          <PagePreview blocks={blocks} frame={home?.frame ?? 'column'} />
        </aside>
      </div>

      <Link href="/new" className={buttonClasses('quiet', '-ms-4 self-start')}>
        <PlusIcon />
        Make another site
      </Link>
    </main>
  );
}
