import type { Metadata } from 'next';
import Link from 'next/link';
import { CopyAddress } from '@/components/copy-address';
import { OpenSiteSettings } from '@/components/site-switcher';
import { siteAddress } from '@/lib/handle';
import { SITE_STATUS } from '@/lib/site-status';
import { getSite, SITE_EDIT } from '@/lib/sites';

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
 * A site's overview: its status, its address with a way to copy it, and who
 * you are on it. Edit and Publish join it with the editor (#20) and
 * publishing (#21); stats come later (#27).
 */
export default async function SitePage({ params }: Props) {
  const { site, role, can } = await getSite((await params).workspaceId);
  const address = siteAddress(site.handle);
  const status =
    SITE_STATUS[site.status === 'deleted' ? 'offline' : site.status];

  return (
    <main className="px-gutter max-w-layout mx-auto flex w-full flex-1 flex-col gap-6 py-12">
      <h1 className="text-h1 m-0 break-words">{site.name}</h1>

      <section
        aria-labelledby="site-card"
        className="bg-lv-card border-lv-border rounded-card p-card flex flex-col gap-4 border-2"
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
              {status.label}
            </span>
          </p>
          <p className="text-lv-text-2 m-0">{status.detail}</p>
        </div>
        <div className="flex flex-col gap-2">
          <p className="m-0 font-semibold">Your link</p>
          <p className="m-0 text-lg break-all">
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
      </section>

      <p className="m-0">
        You&apos;re {ROLES[role] ?? `a ${role}`} on this site.
        {!can(SITE_EDIT) && ' You can look at it, but not change it.'}
      </p>
      <OpenSiteSettings />
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
