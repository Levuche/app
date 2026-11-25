import { PageShell } from '@/components/page-shell';
import { site } from '@/lib/site';

export default function Home() {
  return (
    <PageShell>
      <h1 className="text-h1 m-0">Your Levuche dashboard is on its way</h1>
      <p className="text-lead text-lv-text-2 m-0">
        This is where you&apos;ll connect your social accounts, build your
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
    </PageShell>
  );
}
