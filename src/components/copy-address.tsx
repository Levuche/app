'use client';

import { useState } from 'react';
import { buttonClasses } from '@/lib/button';

/**
 * Copies a site's address, and says so for a moment in words a screen
 * reader hears too. Without the clipboard (an old browser, a page not
 * served over https), it says how to copy it by hand instead.
 */
export function CopyAddress({
  address,
  url = `https://${address}`,
}: {
  address: string;
  /** What's copied, when it isn't the address on https. */
  url?: string;
}) {
  const [said, setSaid] = useState('');

  return (
    <span className="inline-flex flex-wrap items-center gap-3">
      <button
        type="button"
        className={buttonClasses('outline')}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(url);
            setSaid('Copied.');
          } catch {
            setSaid('Select the address to copy it.');
          }
          setTimeout(() => setSaid(''), 4000);
        }}
      >
        Copy link
      </button>
      <span role="status" className="text-lv-text-2 text-sm">
        {said}
      </span>
    </span>
  );
}
