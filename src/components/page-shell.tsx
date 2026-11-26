/** A centred column for simple pages: the placeholder home, 404 and errors. */
export function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="px-gutter text-copy py-page flex min-h-dvh items-center justify-center">
      <div className="max-w-form flex w-full flex-col gap-4">
        <p className="text-logo text-lv-brand dark:text-lv-text m-0">levuche</p>
        {children}
      </div>
    </main>
  );
}
