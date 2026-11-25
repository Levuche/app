# Levuche app

The Levuche app at [app.levuche.com](https://app.levuche.com): where creators
connect their social accounts, build their pages, sell and get paid, and the
page editor. The marketing site is
[Levuche/website](https://github.com/Levuche/website); creator sites on
levuche.page are built from [@levuche/ui](https://github.com/Levuche/ui).

Right now it's the starting point: the Next.js app on Cloudflare Workers with
its checks, deploys, preview links, tests and the Levuche theme. Sign-in and
the dashboard come next; see the open issues.

## Stack

- Next.js 16 and React 19, on Cloudflare Workers through OpenNext
- Tailwind CSS 4 with the Levuche product theme (design tokens v1.1, light
  and dark), which moves to [@levuche/kit](https://github.com/Levuche/kit)
  once kit's first release is tagged
- Playwright with axe for end-to-end and accessibility tests
- Buildbase for sign-in, billing and selling (coming with sign-in)

## Run it

```sh
nvm use            # Node 22
npm ci
cp .env.example .env.local
npm run dev        # http://localhost:3000
```

| Command                        | What it does                              |
| ------------------------------ | ----------------------------------------- |
| `npm run check`                | ESLint, Prettier and the type check       |
| `npm run build && npm run e2e` | The end-to-end and accessibility tests    |
| `npm run cf:preview`           | The Cloudflare Workers build, run locally |

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
