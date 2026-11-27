'use client';

import {
  useSaaSAuth,
  useSaaSWorkspaces,
  WorkspaceSwitcher,
} from '@buildbase/sdk/react';
import { useParams, useRouter } from 'next/navigation';
import { type ReactNode, useEffect, useRef } from 'react';
import { CardIcon, UserIcon, UsersIcon } from '@/components/app-icons';
import { IconButton } from '@/components/icon-button';
import { buttonClasses } from '@/lib/button';

/** The workspace (site) of the page, from /sites/<workspace id>. */
const usePageWorkspace = () =>
  useParams<{ workspaceId?: string }>().workspaceId ?? null;

/**
 * Buildbase's workspace switcher, listing the creator's sites. Buildbase's
 * current workspace follows the page, so the switcher marks the right site
 * and its settings open for it; picking another site in the switcher opens
 * that site's page.
 */
export function SiteSwitcher() {
  const pageWorkspace = usePageWorkspace();
  const {
    currentWorkspace,
    workspaces,
    loaded,
    setCurrentWorkspace,
    refreshWorkspaces,
  } = useSaaSWorkspaces();
  const router = useRouter();
  const current = currentWorkspace?._id ?? null;
  const before = useRef<string | null>(null);
  const refreshedFor = useRef<string | null>(null);

  useEffect(() => {
    if (!loaded) return;
    const previous = before.current;
    before.current = current;
    if (
      previous &&
      current &&
      current !== previous &&
      current !== pageWorkspace
    ) {
      // Picked in the switcher.
      router.push(`/sites/${current}`);
    } else if (pageWorkspace && current !== pageWorkspace) {
      // A new page, or back and forward: no navigation, no Buildbase event.
      const workspace = workspaces.find((w) => w._id === pageWorkspace);
      if (workspace) setCurrentWorkspace(workspace);
      else if (refreshedFor.current !== pageWorkspace) {
        // A site made since the list was read.
        refreshedFor.current = pageWorkspace;
        void refreshWorkspaces();
      }
    }
  }, [
    loaded,
    current,
    pageWorkspace,
    workspaces,
    setCurrentWorkspace,
    refreshWorkspaces,
    router,
  ]);

  if (loaded && workspaces.length === 0) return null;

  return (
    <WorkspaceSwitcher
      trigger={(loading, workspace) => (
        <span
          aria-busy={loading}
          className={buttonClasses('outline', 'max-w-[40vw]')}
        >
          <span className="truncate">
            {workspace && workspace._id === pageWorkspace
              ? workspace.name
              : 'Your sites'}
          </span>
        </span>
      )}
    />
  );
}

/**
 * Buildbase's settings for the page's site: its name and picture, its
 * teammates, and for those who may see them its billing and receipts (#19).
 */
export function OpenSiteSettings({ billing = false }: { billing?: boolean }) {
  const pageWorkspace = usePageWorkspace();
  const { currentWorkspace } = useSaaSWorkspaces();
  const { openWorkspaceSettings } = useSaaSAuth();
  // Settings open for Buildbase's current workspace, so wait until it's this one.
  const ready = currentWorkspace?._id === pageWorkspace;

  const settings: {
    tab: Parameters<typeof openWorkspaceSettings>[0];
    label: string;
    icon: ReactNode;
  }[] = [
    { tab: 'general', label: 'Name and picture', icon: <UserIcon /> },
    { tab: 'users', label: 'Teammates', icon: <UsersIcon /> },
  ];
  if (billing)
    settings.push({
      tab: 'subscription',
      label: 'Billing and receipts',
      icon: <CardIcon />,
    });

  return (
    <div className="flex flex-wrap gap-1">
      {settings.map(({ tab, label, icon }, i) => (
        <IconButton
          key={tab}
          label={label}
          icon={icon}
          look="outline"
          align={i === settings.length - 1 ? 'end' : 'center'}
          disabled={!ready}
          onClick={() => openWorkspaceSettings(tab)}
        />
      ))}
    </div>
  );
}
