'use client';

import { useSaaSAuth } from '@buildbase/sdk/react';
import { useRouter } from 'next/navigation';
import { useId } from 'react';
import { buttonClasses } from '@/lib/button';

const item = buttonClasses('quiet', 'w-full justify-start');

/**
 * Who is signed in, Buildbase's own account and security screens, and signing
 * out (of the app and levuche.com together). A native popover: it closes on
 * Escape or a tap outside, with no script of its own.
 */
export function AccountMenu({ name, email }: { name: string; email: string }) {
  const { openWorkspaceSettings, signOut } = useSaaSAuth();
  const router = useRouter();
  const id = useId();
  // Every item closes the menu as it acts.
  const closes = { popoverTarget: id, popoverTargetAction: 'hide' } as const;

  return (
    <>
      <button
        type="button"
        popoverTarget={id}
        className={buttonClasses('outline', 'max-w-[60vw]')}
      >
        <span className="truncate">{name || email}</span>
      </button>
      <div
        id={id}
        popover="auto"
        className="bg-lv-card text-lv-text border-lv-border right-gutter inset-auto top-14 m-0 w-64 max-w-[calc(100vw-2rem)] rounded-2xl border p-2 shadow-lg"
      >
        <p className="text-lv-text-2 m-0 truncate px-3 pt-1 pb-2 text-sm">
          {email}
        </p>
        <button
          type="button"
          {...closes}
          className={item}
          onClick={() => openWorkspaceSettings('profile')}
        >
          Account
        </button>
        <button
          type="button"
          {...closes}
          className={item}
          onClick={() => openWorkspaceSettings('security')}
        >
          Security and devices
        </button>
        <button
          type="button"
          {...closes}
          className={item}
          onClick={async () => {
            await signOut();
            router.refresh();
          }}
        >
          Sign out
        </button>
      </div>
    </>
  );
}
