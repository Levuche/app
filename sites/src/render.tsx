// The HTML of a creator site's pages (#23): the published page, drawn with
// the same blocks and frame as the editor's preview and the private preview
// link, and the pages a visitor sees when there's nothing to show. Static
// HTML: no scripts run on a creator site.
import { renderToStaticMarkup } from 'react-dom/server.edge';
import type { PageLayouts } from '@levuche/ui';
import type { ReactNode } from 'react';
import { CreatorPage } from '../../src/components/creator-page';
import { pageBlocks } from '../../src/components/page-blocks';
import css from '../generated/site.css';
import type { InApp, Missing, Renderer } from './serve';
import { androidOpenUrl } from './visitor';

const WEBSITE = 'https://levuche.com';

const text = (value: unknown) =>
  typeof value === 'string' && value.trim() ? value.trim() : null;

function document({
  title,
  description,
  url,
  image,
  inApp,
  children,
}: {
  title: string;
  description?: string | null;
  url: string;
  image?: string | null;
  inApp: InApp;
  children: ReactNode;
}) {
  const body = renderToStaticMarkup(
    <>
      {inApp ? <OpenInBrowser inApp={inApp} url={url} /> : null}
      {children}
    </>
  );
  const meta = renderToStaticMarkup(
    <>
      <meta charSet="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>{title}</title>
      {description ? <meta name="description" content={description} /> : null}
      <link rel="canonical" href={url} />
      <meta property="og:type" content="profile" />
      <meta property="og:title" content={title} />
      <meta property="og:url" content={url} />
      {description ? (
        <meta property="og:description" content={description} />
      ) : null}
      {image ? <meta property="og:image" content={image} /> : null}
      <meta name="twitter:card" content="summary" />
      <meta name="color-scheme" content="light" />
    </>
  );
  // The stylesheet is our own, built from sites/src/site.css: never a creator's words.
  return `<!doctype html><html lang="en"><head>${meta}<style>${css}</style></head><body class="bg-lv-bg text-lv-text font-sans antialiased">${body}</body></html>`;
}

/**
 * A slim bar inside a social app's own browser, which hides the address
 * bar: on Android a link opens the page in the phone's browser, and on an
 * iPhone, where no link can, it says where the app keeps that button.
 */
function OpenInBrowser({
  inApp,
  url,
}: {
  inApp: Exclude<InApp, null>;
  url: string;
}) {
  return (
    <p
      data-open-in-browser
      className="bg-lv-surface-2 text-lv-text m-0 px-4 py-2 text-center text-sm"
    >
      {inApp === 'android' ? (
        <a
          href={androidOpenUrl(url)}
          className="text-lv-link font-semibold underline underline-offset-4"
        >
          Open in your browser
        </a>
      ) : (
        <>
          For the full page, tap <span aria-hidden="true">•••</span>
          <span className="sr-only">the menu button</span> and choose Open in
          browser.
        </>
      )}
    </p>
  );
}

const MISSING: Record<
  Missing,
  {
    title: string;
    say: (handle: string) => string;
    link?: 'claim' | 'home' | 'retry';
  }
> = {
  free: {
    title: 'This address is free',
    say: (handle) =>
      `Nobody has ${handle}.levuche.page yet. It could be yours: make a page for your links, your shop and your bookings.`,
    link: 'claim',
  },
  none: {
    title: 'No page here',
    say: () => 'There’s no page at this address.',
  },
  'not-live': {
    title: 'Not live yet',
    say: () => 'This page is still being made. Check back soon to see it.',
  },
  offline: {
    title: 'Not available',
    say: () =>
      'This page isn’t available right now. Its owner took it offline.',
  },
  paused: {
    title: 'Not available',
    say: () => 'This page isn’t available right now.',
  },
  removed: {
    title: 'Page removed',
    say: () => 'This page was removed by its owner.',
  },
  'no-page': {
    title: 'Page not found',
    say: () => 'This site has no page at this address.',
    link: 'home',
  },
  error: {
    title: 'Something went wrong',
    say: () => 'This page didn’t load. Try again in a moment.',
    link: 'retry',
  },
};

function Missing({
  why,
  handle,
  base,
  url,
  app,
}: {
  why: Missing;
  handle: string;
  base: string;
  url: string;
  app: string;
}) {
  const { title, say, link } = MISSING[why];
  const linkClass =
    'bg-lv-primary text-lv-on-primary rounded-full px-5 py-3 font-semibold no-underline';
  return (
    <main className="mx-auto flex min-h-[80dvh] max-w-xl flex-col items-center justify-center gap-4 px-6 py-16 text-center">
      <a href={WEBSITE} className="text-logo text-lv-brand mb-4 no-underline">
        levuche
      </a>
      <h1 className="text-h2 m-0">{title}</h1>
      <p className="text-lv-text-2 m-0">{say(handle)}</p>
      {link === 'claim' ? (
        <a
          className={linkClass}
          href={`${app}/new?handle=${encodeURIComponent(handle)}`}
        >
          Make it yours
        </a>
      ) : link === 'home' ? (
        <a className={linkClass} href={`${base}/`}>
          Go to the home page
        </a>
      ) : link === 'retry' ? (
        <a className={linkClass} href={url}>
          Try again
        </a>
      ) : null}
      <a
        href={WEBSITE}
        className="text-lv-text-2 mt-6 text-sm underline-offset-4 hover:underline"
      >
        Made with Levuche
      </a>
    </main>
  );
}

/** What Levuche does, for the intro on levuche.page itself. */
const INTRO_POINTS: ReadonlyArray<[string, string]> = [
  [
    'Your own address.',
    'Get yourname.levuche.page: one name, one site, yours alone.',
  ],
  [
    'Ready-made sections.',
    'Build your page in your own brand. It looks right on every phone.',
  ],
  [
    'Sell what you make.',
    'Packs, prompts and guides. Buyers pay by card and download straight away.',
  ],
  [
    'One link for every reel.',
    'Put it in your bio and send every follower to one place.',
  ],
  ['Pay once.', '$9 per page, with no monthly fee.'],
];

/**
 * What Levuche is, a way to start and a way to read more: levuche.page
 * itself, and (with `free`) an address nobody has yet, which it offers.
 */
function Intro({ app, free }: { app: string; free?: string }) {
  const button =
    'inline-flex min-h-12 items-center justify-center rounded-full border-2 px-6 font-semibold no-underline';
  return (
    <main className="mx-auto flex min-h-[90dvh] max-w-2xl flex-col justify-center gap-6 px-6 py-16">
      <a href={WEBSITE} className="text-logo text-lv-brand no-underline">
        levuche
      </a>
      {free ? (
        <>
          <h1 className="text-h1 m-0 break-words">
            {free}.levuche.page is free
          </h1>
          <p className="text-lead text-lv-text-2 m-0">
            Nobody has this address yet. It could be yours: Levuche turns your
            Instagram link into a small website that sells your packs, prompts
            and guides.
          </p>
        </>
      ) : (
        <>
          <h1 className="text-h1 m-0">Your link in bio, now a shop.</h1>
          <p className="text-lead text-lv-text-2 m-0">
            Levuche turns your Instagram link into a small website that sells
            your packs, prompts and guides.
          </p>
        </>
      )}
      <ul className="m-0 flex list-none flex-col gap-3 p-0">
        {INTRO_POINTS.map(([lead, rest]) => (
          <li key={lead} className="flex gap-3">
            <span aria-hidden="true" className="text-lv-primary font-bold">
              ✓
            </span>
            <span>
              <strong>{lead}</strong>{' '}
              <span className="text-lv-text-2">{rest}</span>
            </span>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-3 pt-2">
        <a
          href={
            free
              ? `${app}/new?handle=${encodeURIComponent(free)}`
              : `${app}/new`
          }
          className={`${button} bg-lv-primary text-lv-on-primary border-transparent`}
        >
          {free ? 'Make it yours' : 'Get started'}
        </a>
        <a
          href={WEBSITE}
          className={`${button} border-lv-border text-lv-link bg-transparent`}
        >
          Learn more
        </a>
      </div>
    </main>
  );
}

/** The foot of every live page: who made it, and a way to report it (#33). */
function SiteFoot({
  handle,
  path,
  app,
}: {
  handle: string;
  path: string;
  app: string;
}) {
  const report = `${app}/report/${encodeURIComponent(handle)}${path ? `?page=${encodeURIComponent(path)}` : ''}`;
  const linkClass = 'text-lv-text-2 underline-offset-4 hover:underline';
  return (
    <footer className="flex flex-wrap justify-center gap-x-6 gap-y-2 px-4 pt-4 pb-8 text-sm">
      <a href={WEBSITE} className={linkClass}>
        Made with Levuche
      </a>
      <a href={report} className={linkClass} rel="nofollow">
        Report this page
      </a>
    </footer>
  );
}

export const render: Renderer = {
  intro({ inApp, url, app }) {
    return document({
      title: 'Levuche: your link in bio, now a shop',
      description:
        'Levuche turns your Instagram link into a small website that sells your packs, prompts and guides. Pay $9 once.',
      url,
      inApp,
      children: <Intro app={app} />,
    });
  },
  page({ site, page, inApp, app }) {
    const header = page.blocks.find((block) => block.type === 'creator-header')
      ?.props as Record<string, unknown> | undefined;
    const name = text(header?.name) ?? site.handle;
    const avatar = text(header?.avatar);
    return document({
      title: page.path ? `${page.title} | ${name}` : name,
      description: text(header?.tagline),
      url: page.path ? `${site.base}/${page.path}` : `${site.base}/`,
      image: avatar?.startsWith('https://') ? avatar : null,
      inApp,
      children: (
        <>
          <CreatorPage
            blocks={pageBlocks(page.blocks)}
            frame={page.frame}
            layouts={page.layouts as PageLayouts}
          />
          <SiteFoot handle={site.handle} path={page.path} app={app} />
        </>
      ),
    });
  },
  missing({ why, site, inApp, url, app }) {
    const here = site.path ? `${site.base}/${site.path}` : `${site.base}/`;
    return document({
      title: MISSING[why].title,
      url: here,
      inApp,
      children:
        why === 'free' ? (
          <Intro app={app} free={site.handle} />
        ) : (
          <Missing
            why={why}
            handle={site.handle}
            base={site.base}
            url={why === 'error' ? url : here}
            app={app}
          />
        ),
    });
  },
};
