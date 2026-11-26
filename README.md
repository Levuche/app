# Levuche app

The Levuche app at [app.levuche.com](https://app.levuche.com): where creators
connect their social accounts, build their pages, sell and get paid, and the
page editor. The marketing site is
[Levuche/website](https://github.com/Levuche/website); creator sites on
levuche.page are built from [@levuche/ui](https://github.com/Levuche/ui).

Right now it has sign-in with Buildbase ([docs/AUTH.md](docs/AUTH.md)) and
the creator page layout. The dashboard and the editor come next; the plan is
issue #36.

## Creator pages

A creator's page is drawn by `CreatorPage` (`src/components/creator-page.tsx`)
from the blocks in [@levuche/ui](https://github.com/Levuche/ui), in one of two
layouts (`src/lib/page-layout.ts`):

- **Profile beside the grid** (the default): on a tablet and a desktop the
  profile sits in a column on the left and stays in view, with the blocks in
  a grid beside it; on a phone everything is one column.
- **One column**: every block in one centred column on every screen.

A "Back to top" button shows up once a visitor has scrolled. To see both on
a phone, a tablet and a desktop, open the sample page at `/preview`
(`/preview?layout=column` for one column, `?scheme=dark` for the creator's
dark colours).

## Stack

- Next.js 16 and React 19, on Cloudflare Workers through OpenNext
- Tailwind CSS 4 with the Levuche product theme (design tokens v1.1, light
  and dark) from [@levuche/kit](https://github.com/Levuche/kit), installed by
  its release tag
- Playwright with axe for end-to-end and accessibility tests
- Buildbase for sign-in ([docs/AUTH.md](docs/AUTH.md)), and later billing
  and selling

## Run it

```sh
nvm use            # Node 22
npm ci
cp .env.example .env.local
npm run dev        # http://localhost:3000
```

Without Buildbase settings in `.env.local`, every page says sign-in isn't
open yet; [docs/AUTH.md](docs/AUTH.md) has the settings.

| Command                            | What it does                                                                   |
| ---------------------------------- | ------------------------------------------------------------------------------ |
| `npm run check`                    | ESLint, Prettier and the type check                                            |
| `npm run e2e:build && npm run e2e` | The end-to-end and accessibility tests, signed in through a stand-in Buildbase |
| `npm run cf:preview`               | The Cloudflare Workers build, run locally                                      |

## How work moves

Branches go `type/short-name` > `dev` > `main` ([docs/BRANCHES.md](docs/BRANCHES.md)).
Merging into `dev` deploys app-dev.levuche.com; merging `dev` into `main`
deploys app.levuche.com ([docs/DEPLOY.md](docs/DEPLOY.md)).

## Help and feedback

- Questions and ideas: [Discussions](https://github.com/Levuche/app/discussions)
- Bugs and requests: [Issues](https://github.com/Levuche/app/issues/new/choose)
- Security problems: privately, see [SECURITY.md](SECURITY.md)
- Your own account, an order or a payout: [levuche.com/contact](https://levuche.com/contact)

How issues are handled and how the team works: [CONTRIBUTING.md](CONTRIBUTING.md).

## Licence

All rights reserved, Jagodana LLC. This repository is public so that people
can see how Levuche is built; it isn't open source. See [LICENSE](LICENSE)
and [TRADEMARKS.md](TRADEMARKS.md).
