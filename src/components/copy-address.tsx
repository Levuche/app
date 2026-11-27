'use client';

import { useState } from 'react';
import { CopyIcon } from '@/components/app-icons';
import { IconButton } from '@/components/icon-button';
import { buttonClasses } from '@/lib/button';

/**
 * Copies a site's address, and says so for a moment in words a screen
 * reader hears too. Without the clipboard (an old browser, a page not
 * served over https), it says how to copy it by hand instead.
 */
export function CopyAddress({
  address,
  url = `https://${address}`,
  compact = false,
}: {
  address: string;
  /** What's copied, when it isn't the address on https. */
  url?: string;
  /** Just the copy icon, with "Copy link" in its tooltip. */
  compact?: boolean;
}) {
  const [said, setSaid] = useState('');
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setSaid('Copied.');
    } catch {
      setSaid('Select the address to copy it.');
    }
    setTimeout(() => setSaid(''), 4000);
  };

  return (
    <span className="inline-flex flex-wrap items-center gap-3">
      {compact ? (
        <IconButton
          label="Copy link"
          look="outline"
          icon={<CopyIcon />}
          onClick={copy}
        />
      ) : (
        <button
          type="button"
          className={buttonClasses('outline')}
          onClick={copy}
        >
          <CopyIcon />
          Copy link
        </button>
      )}
      <span role="status" className="text-lv-text-2 text-sm">
        {said}
      </span>
    </span>
  );
}
