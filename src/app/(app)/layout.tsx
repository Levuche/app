import Link from 'next/link';
import { AccountMenu } from '@/components/account-menu';
import { SiteSwitcher } from '@/components/site-switcher';
import { requireUser } from '@/lib/buildbase';

/**
 * Every page in (app) is for signed-in creators: the header with their
 * sites and their account, around the page. Each page calls requireUser() too, because a
 * layout and its page render side by side (docs/AUTH.md).
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="px-gutter border-lv-border flex h-16 items-center justify-between gap-4 border-b">
        <div className="flex min-w-0 items-center gap-4">
          <Link
            href="/"
            className="text-logo text-lv-brand dark:text-lv-text no-underline"
          >
            levuche
          </Link>
          <SiteSwitcher />
        </div>
        <AccountMenu name={user.name} email={user.email} />
      </header>
      {children}
    </div>
  );
}
