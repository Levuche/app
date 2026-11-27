import Link from 'next/link';
import { PageShell } from '@/components/page-shell';

export default function NotFound() {
  return (
    <PageShell>
      <h1 className="text-title-lg m-0">Page not found</h1>
      <p className="text-lv-text-2 m-0">
        That page isn&apos;t here. It may have moved.
      </p>
      <p className="m-0">
        <Link
          href="/"
          className="text-lv-link font-semibold underline-offset-4 hover:underline"
        >
          Go to your dashboard
        </Link>
      </p>
    </PageShell>
  );
}
