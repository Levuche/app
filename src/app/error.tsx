'use client';

import { useEffect } from 'react';
import { PageShell } from '@/components/page-shell';

/** Shown when a page fails. The details go to the logs, not the screen. */
export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <PageShell>
      <h1 className="text-h1 m-0">Something went wrong</h1>
      <p className="text-lv-text-2 m-0">
        Please try again. If it keeps happening, tell us at levuche.com/contact
        {error.digest ? ` and mention code ${error.digest}` : ''}.
      </p>
      <p className="m-0">
        <button
          type="button"
          onClick={reset}
          className="bg-lv-primary text-lv-on-primary min-h-control rounded-tile px-4 font-semibold"
        >
          Try again
        </button>
      </p>
    </PageShell>
  );
}
