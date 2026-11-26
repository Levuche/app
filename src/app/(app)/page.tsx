import { requireUser } from '@/lib/buildbase';
import { site } from '@/lib/site';

export default async function Home() {
  // The layout's check, cached for this request: no second lookup.
  const firstName = (await requireUser()).name?.trim().split(/\s+/)[0];

  return (
    <main className="px-gutter max-w-form mx-auto flex w-full flex-1 flex-col justify-center gap-4 py-16">
      <h1 className="text-h1 m-0">
        {firstName ? `Welcome, ${firstName}` : 'Welcome'}
      </h1>
      <p className="text-lead text-lv-text-2 m-0">
        Your dashboard is on its way. This is where you&apos;ll build your
        pages, sell and get paid.
      </p>
      <p className="m-0">
        <a
          href={site.websiteUrl}
          className="text-lv-link font-semibold underline-offset-4 hover:underline"
        >
          Go to levuche.com
        </a>
      </p>
    </main>
  );
}
