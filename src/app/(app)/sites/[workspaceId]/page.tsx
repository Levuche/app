import type { Metadata } from 'next';
import Link from 'next/link';
import { OpenSiteSettings } from '@/components/site-switcher';
import { buttonClasses } from '@/lib/button';
import { siteAddress } from '@/lib/handle';
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

/** A site's overview. The dashboard (#25) fills it in. */
export default async function SitePage({ params }: Props) {
  const { site, role, can } = await getSite((await params).workspaceId);

  return (
    <main className="px-gutter max-w-layout mx-auto flex w-full flex-1 flex-col gap-6 py-12">
      <div className="flex flex-col gap-2">
        <h1 className="text-h1 m-0 break-words">{site.name}</h1>
        <p className="text-lv-text-2 m-0">
          {siteAddress(site.handle)} · Not published yet
        </p>
      </div>
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
      <OpenSiteSettings />
      {/* Until the dashboard's menu (#25) has its own place for it. */}
      <Link
        href="/new"
        className="text-lv-link self-start font-semibold underline-offset-4 hover:underline"
      >
        Make another site
      </Link>
    </main>
  );
}
