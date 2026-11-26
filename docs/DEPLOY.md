# Deploying to Cloudflare

The app runs on Cloudflare Workers, built with OpenNext and deployed by
GitHub Actions, the same way as the website (Levuche/website, docs/DEPLOY.md).

| Address                                          | Serves                                 | Deployed from                |
| ------------------------------------------------ | -------------------------------------- | ---------------------------- |
| `app.levuche.com`                                | The app (Worker `levuche-app`)         | `main`                       |
| `app-dev.levuche.com`                            | The dev app (Worker `levuche-app-dev`) | `dev`                        |
| `pr-<n>-levuche-app-dev.<subdomain>.workers.dev` | One pull request's preview             | each pull request into `dev` |

- `.github/workflows/ci.yml` checks, builds and tests every push and pull
  request. It needs no secrets.
- `.github/workflows/deploy.yml` deploys `dev` and `main` after each merge,
  then checks `/api/health`.
- `.github/workflows/preview.yml` uploads each pull request into `dev` as a
  preview version of the dev Worker, posts the link on the pull request and
  runs the end-to-end tests against it.

Every page sends `noindex` and `robots.txt` blocks every crawler: the app is
for signed-in creators, not for search.

Nothing secret goes in the repo. Don't also connect the repo to Cloudflare's
own Git builds (Workers Builds), or every push would deploy twice.

## Before the first merge into dev

1. **Cloudflare API token.** The website's token works if it covers the
   Levuche account and the `levuche.com` zone (Workers Scripts: Edit,
   D1: Edit, Account Settings: Read, and on the zone Workers Routes: Edit,
   DNS: Edit, Zone: Read). Or create one with the same scopes. D1: Edit lets
   the deploy apply database migrations ([DATABASE.md](DATABASE.md)).
2. **GitHub settings,** in `Levuche/app` > **Settings** > **Secrets and
   variables** > **Actions**:
   - repository secret `CLOUDFLARE_API_TOKEN`: the token;
   - repository variable `CLOUDFLARE_ACCOUNT_ID`: the account id (not secret).
3. **Environments:** create `development` (deploys only from `dev`) and
   `production` (deploys only from `main`; add yourself as a required
   reviewer if production should wait for your click).

4. **R2 for pictures** (#24). Turn on R2 in the account (Cloudflare
   dashboard > R2), then make the two buckets the Workers use:

   ```sh
   npx wrangler r2 bucket create levuche-files-dev
   npx wrangler r2 bucket create levuche-files
   ```

   A deploy fails until its bucket exists. The API token also needs
   Workers R2 Storage: Edit if the deploy should make buckets itself.

The first deploy of each branch creates its Worker and its custom domain on
the `levuche.com` zone. A new domain's certificate can take a few minutes.

## Keep the dev app private

`app-dev.levuche.com` and the preview links are for the team. Put them behind
Cloudflare Access (Zero Trust > Access > Applications), as for the website's
dev site. For the smoke test and preview tests to see past it, add an Access
service token as the repository secrets `CF_ACCESS_CLIENT_ID` and
`CF_ACCESS_CLIENT_SECRET`; without them the checks only confirm that Access
asks for sign-in.

## Creator sites on levuche.page

The sites Worker (`sites/`, [SITES.md](SITES.md)) deploys with the app:
`levuche-sites-dev` on `sites-dev.levuche.com` from `dev`, and
`levuche-sites` on the route `*.levuche.page/*` from `main`. Before live
sites answer in production:

1. The `levuche.page` zone is in the Levuche Cloudflare account. Add a
   proxied wildcard record, `*` AAAA `100::`, so every handle reaches the
   Worker. Universal SSL covers `*.levuche.page`.
2. The API token also needs, on the `levuche.page` zone, Workers Routes:
   Edit and Zone: Read.

## Security headers

`next.config.ts` sends a Content-Security-Policy with every response,
allowing only the app's own origin, the Buildbase API, Stripe's card fields
(Buildbase's billing screens) and YouTube's privacy-mode player. It is
enforced only on app.levuche.com; app-dev, previews and `npm run dev` send
it as report-only. Browsers report what it blocks, or would block, to
`/api/csp-report`, which writes one `csp-violation` line per report to the
Worker's logs (Workers > levuche-app or levuche-app-dev > Observability),
keeping only the directive, the blocked origin and the page's path. Before
a release, open app-dev with the browser console open and sign in, open the
account and team screens and sign out: nothing should be reported. A host
that shows up there goes into the policy.

## Runtime secrets

The sign-in client's secret, from the Buildbase console, is set on each
Worker, never in the repo or GitHub ([AUTH.md](AUTH.md)):

```sh
npx wrangler secret put BUILDBASE_CLIENT_SECRET --env dev
npx wrangler secret put BUILDBASE_CLIENT_SECRET
```

The Levuche team's Buildbase user ids, separated by commas, open the
reports and pauses screen at `/staff` ([SITES.md](SITES.md)). Kept out of
the repo:

```sh
npx wrangler secret put STAFF_USER_IDS --env dev
npx wrangler secret put STAFF_USER_IDS
```

## Deploying again

**Actions** > **Deploy to Cloudflare** > **Run workflow**, then pick `dev` or
`main`.
