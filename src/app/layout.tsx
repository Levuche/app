import type { Metadata, Viewport } from 'next';
import { BuildbaseProvider } from '@/components/buildbase-provider';
import { ThemeProvider } from '@/components/theme-provider';
import { appUrl, site } from '@/lib/site';
import '@buildbase/sdk/css';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  title: { default: site.name, template: `%s | ${site.name}` },
  description: site.description,
  applicationName: site.name,
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: '48x48' },
      { url: '/favicon.svg', type: 'image/svg+xml' },
    ],
    apple: '/apple-touch-icon.png',
  },
  // A signed-in app: never in search results.
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: site.themeColor,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="bg-lv-bg text-lv-text font-sans antialiased">
        <ThemeProvider
          attribute="data-lv"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <BuildbaseProvider>{children}</BuildbaseProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
