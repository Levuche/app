import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { siteStore } from '@/lib/db';
import { database, getSite, SITE_EDIT } from '@/lib/sites';
import { PageEditor } from './page-editor';

type Props = {
  params: Promise<{ workspaceId: string }>;
  searchParams: Promise<{ block?: string | string[] }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { site } = await getSite((await params).workspaceId);
  return { title: `Edit ${site.name}` };
}

/**
 * The page editor (#20) for a site's home page. `?block=<id>` opens with
 * that block selected, as the publish checks' "Fix" links do.
 */
export default async function EditPage({ params, searchParams }: Props) {
  const { workspaceId } = await params;
  const { block } = await searchParams;
  const { site, can } = await getSite(workspaceId);
  const store = siteStore(await database(), { workspaceId });
  const home = (await store.pages(site.id)).find((page) => page.isHome);
  if (!home) notFound();
  const blocks = await store.blocks(home.id);

  return (
    <main className="px-gutter py-page mx-auto flex w-full max-w-[1600px] flex-1 flex-col gap-5">
      <div className="flex flex-col gap-1">
        <Link
          href={`/sites/${workspaceId}`}
          className="text-lv-link self-start text-sm font-semibold underline-offset-4 hover:underline"
        >
          Back to {site.name}
        </Link>
        <h1 className="text-title m-0 break-words">Edit your page</h1>
        <p className="text-lv-text-2 m-0">
          Changes save as you go. Visitors see them once you publish.
        </p>
      </div>
      <PageEditor
        workspaceId={workspaceId}
        pageId={home.id}
        frame={home.frame}
        initialBlocks={blocks}
        initialSelected={typeof block === 'string' ? block : undefined}
        readOnly={!can(SITE_EDIT)}
      />
    </main>
  );
}
