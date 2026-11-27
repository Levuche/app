import Link from 'next/link';
import { redirect } from 'next/navigation';
import { siteAddress } from '@/lib/handle';
import { listSites } from '@/lib/sites';

/**
 * Where signing in lands: a new creator goes on to make a site, and someone
 * with one site goes straight to it.
 */
export default async function Home() {
  const sites = await listSites();
  if (sites.length === 0) redirect('/new');
  if (sites.length === 1) redirect(`/sites/${sites[0].workspaceId}`);

  return (
    <main className="px-gutter max-w-layout py-page mx-auto flex w-full flex-1 flex-col gap-5">
      <h1 className="text-title m-0">Your sites</h1>
      <ul className="m-0 grid list-none gap-3 p-0 sm:grid-cols-2 lg:grid-cols-3">
        {sites.map((site) => (
          <li key={site.workspaceId}>
            <Link
              href={`/sites/${site.workspaceId}`}
              className="bg-lv-card border-lv-border hover:border-lv-link rounded-box p-box flex flex-col gap-1 border-2 no-underline transition-[border-color,box-shadow,transform] duration-150 hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 motion-reduce:transition-none motion-reduce:hover:translate-y-0"
            >
              <span className="text-item text-lv-text break-words">
                {site.name}
              </span>
              <span className="text-lv-text-2 text-sm">
                {siteAddress(site.handle)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <Link
        href="/new"
        className="text-lv-link self-start font-semibold underline-offset-4 hover:underline"
      >
        Make another site
      </Link>
    </main>
  );
}
