# Levuche app

The Levuche app at [app.levuche.com](https://app.levuche.com): where creators
connect their social accounts, build their pages, sell and get paid, and the
page editor. The marketing site is
[Levuche/website](https://github.com/Levuche/website); creator sites on
levuche.page are built from [@levuche/ui](https://github.com/Levuche/ui).

Right now it has sign-in with Buildbase ([docs/AUTH.md](docs/AUTH.md)), the
database for sites and pages ([docs/DATABASE.md](docs/DATABASE.md)), sites
as Buildbase workspaces with teammates and roles
([docs/SITES.md](docs/SITES.md)) and the creator page layout. The dashboard
and the editor come next; the plan is issue #36. Help for creators is in
[docs/help](docs/help).

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

## Start here

This part is for anyone picking up the work, a developer or an AI agent,
with no history of earlier chats.

1. **Read the release plan, issue
   [#45](https://github.com/Levuche/app/issues/45),** then
   [#36](https://github.com/Levuche/app/issues/36) for the order of work in
   this repo. Levuche ships in small releases, one milestone each: check an
   issue's milestone before you start it, work on `R1 Launch` first, and
   build only the part of an issue that #45 puts in that release. Each issue
   has a "Done when" checklist: tick it as you go.
2. **File the issue first.** Every change starts as an issue with a milestone, a
   priority label (`P0: before launch`, `P1: soon after` or `P2: later`) and an area
   label such as `editor` or `dashboard`. Update the issue as the work moves,
   so the next person can carry on from where you stopped.
3. **One issue, one branch, one pull request.** Branch from `dev` as
   `type/short-name`, add or update the tests, and open one pull request into
   `dev` that says `Closes #N`.
4. **A change is done when** its tests pass, including the accessibility
   checks, and its notes in `docs/` are current. The phone, tablet and
   desktop check on app-dev.levuche.com, the recording and the help guides
   in `docs/help/` happen once per release, not for every pull request.

These rules always hold:

- Never name another product, company or site as the source of an idea, in
  an issue, a pull request, a commit or the code.
- Never commit a secret, a token, the Buildbase organization id or
  environment key, or anyone's email address. The repo is public, so
  screenshots and recordings posted here mustn't show them either.
- Keep the GitHub Actions allow-list strict: use an outside action only when
  nothing already allowed does the job, and ask an owner to allow it.
- Blocks and the theme come from [@levuche/ui](https://github.com/Levuche/ui)
  and [@levuche/kit](https://github.com/Levuche/kit), installed by release
  tag. Change them in those repos, not here.
- Use what Buildbase already provides (sign-in, workspaces, members, roles,
  billing) before writing your own.
- Build against Buildbase's development environment, and copy nothing to
  production.

The notes: [sign-in](docs/AUTH.md), [the database](docs/DATABASE.md),
[deploys](docs/DEPLOY.md) and [branches](docs/BRANCHES.md). Guides for
creators are in [docs/help](docs/help).

## Stack

- Next.js 16 and React 19, on Cloudflare Workers through OpenNext
- Tailwind CSS 4 with the Levuche product theme (design tokens v1.1, light
  and dark) from [@levuche/kit](https://github.com/Levuche/kit), installed by
  its release tag
- Playwright with axe for end-to-end and accessibility tests
- Buildbase for sign-in ([docs/AUTH.md](docs/AUTH.md)), and later billing
  and selling
- Cloudflare D1 for sites, pages and published versions
  ([docs/DATABASE.md](docs/DATABASE.md))

## Run it

```sh
nvm use            # Node 22
npm ci
cp .env.example .env.local
npx wrangler d1 migrations apply DB --local   # the local database
npm run dev        # http://localhost:3000
```

Without Buildbase settings in `.env.local`, every page says sign-in isn't
open yet; [docs/AUTH.md](docs/AUTH.md) has the settings.

| Command                            | What it does                                                                   |
| ---------------------------------- | ------------------------------------------------------------------------------ |
| `npm run check`                    | ESLint, Prettier and the type check                                            |
| `npm test`                         | The database tests, on a local D1                                              |
| `npm run e2e:build && npm run e2e` | The end-to-end and accessibility tests, signed in through a stand-in Buildbase |
| `npm run cf:preview`               | The Cloudflare Workers build, run locally                                      |

The end-to-end tests need Playwright's Chromium once
(`npx playwright install --with-deps chromium`). They also run on every pull
request, so where Chromium won't install, push and read the CI result.
Preview links on workers.dev can't read the levuche.com sign-in cookie, so
they only show the signed-out screen: check signed-in screens at
app-dev.levuche.com after the merge.

## Settings and secrets

Names only here: values never go in the repo.

| Name                                             | What it is                                                               | Where the value lives                                                                           |
| ------------------------------------------------ | ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_APP_URL`                            | The app's own address                                                    | `.env.local`; the deploy workflow sets it for dev and production                                |
| `NEXT_PUBLIC_BUILDBASE_ORG_ID`                   | The Buildbase organization                                               | `.env.local`; GitHub variable `BUILDBASE_ORG_ID`                                                |
| `NEXT_PUBLIC_BUILDBASE_ENVIRONMENT`              | The Buildbase development environment's key, empty in production         | `.env.local`; GitHub variable `BUILDBASE_ENVIRONMENT`                                           |
| `NEXT_PUBLIC_BUILDBASE_CLIENT_ID`                | The app's sign-in client                                                 | `.env.local`; GitHub variables `BUILDBASE_CLIENT_ID` (dev) and `BUILDBASE_PRODUCTION_CLIENT_ID` |
| `NEXT_PUBLIC_BUILDBASE_REDIRECT_URL`             | Where sign-in comes back to, which must be on the client's redirect list | `.env.local`; the deploy workflow sets it                                                       |
| `BUILDBASE_CLIENT_SECRET`                        | The sign-in client's secret                                              | `.env.local`; each Worker's secrets (`npx wrangler secret put`)                                 |
| `CLOUDFLARE_API_TOKEN`                           | Deploys the Workers and applies database migrations                      | GitHub secret, with the scopes in [docs/DEPLOY.md](docs/DEPLOY.md)                              |
| `CLOUDFLARE_ACCOUNT_ID`                          | The Cloudflare account, not secret                                       | GitHub variable                                                                                 |
| `CF_ACCESS_CLIENT_ID`, `CF_ACCESS_CLIENT_SECRET` | Optional: let the checks past Cloudflare Access on the dev app           | GitHub secrets                                                                                  |

The organization id, environment key and client ids come from the Buildbase
console: ask an owner for your local values. The end-to-end tests need none
of them, because they use made-up values (`e2e/e2e.env`) and a stand-in
Buildbase (`e2e/mock-buildbase.mjs`).

On Cloudflare, the Worker `levuche-app` serves app.levuche.com from `main`
and `levuche-app-dev` serves app-dev.levuche.com from `dev`. Each has its own
D1 database (`levuche-app`, `levuche-app-dev`) on the binding `DB`; the
deploy applies the migrations in `migrations/`.

## How work moves

Branches go `type/short-name` > `dev` > `main` ([docs/BRANCHES.md](docs/BRANCHES.md)).
Merging into `dev` deploys app-dev.levuche.com; merging `dev` into `main`
deploys app.levuche.com ([docs/DEPLOY.md](docs/DEPLOY.md)).

The workflows: `ci.yml` checks, builds and tests every push and pull
request; `preview.yml` uploads each pull request into `dev` as a preview and
tests it; `deploy.yml` applies database migrations and deploys after each
merge into `dev` or `main`. A merge into `dev` needs an approval from someone
other than the author, so a pull request an agent opens is approved by a
person.

Only an owner can:

- merge without that approval
- change GitHub secrets, variables, rulesets and the Actions allow-list
- change the Buildbase console (sign-in clients, roles, settings) and the
  Cloudflare account (tokens, Workers, databases, Access)
- set a Worker's secrets

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
