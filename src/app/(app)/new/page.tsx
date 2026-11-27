import type { Metadata } from 'next';
import { requireUser } from '@/lib/buildbase';
import { isHandle } from '@/lib/handle';
import { NewSiteForm } from './new-site-form';

export const metadata: Metadata = { title: 'New site' };

interface Props {
  /** ?handle=, from "Make it yours" on a free levuche.page address. */
  searchParams: Promise<{ handle?: string | string[] }>;
}

export default async function NewSite({ searchParams }: Props) {
  await requireUser();
  const asked = (await searchParams).handle;
  const wanted = (typeof asked === 'string' ? asked : '').trim().toLowerCase();

  return (
    <main className="px-gutter max-w-form py-page mx-auto flex w-full flex-1 flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-title-lg m-0">Make a site</h1>
        <p className="text-lv-text-2 m-0">
          Give it a name and pick its address. You can rename it later.
        </p>
      </div>
      <NewSiteForm handle={isHandle(wanted) ? wanted : ''} />
    </main>
  );
}
