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
   Account Settings: Read, and on the zone Workers Routes: Edit, DNS: Edit,
   Zone: Read). Or create one with the same scopes.
2. **GitHub settings,** in `Levuche/app` > **Settings** > **Secrets and
   variables** > **Actions**:
   - repository secret `CLOUDFLARE_API_TOKEN`: the token;
   - repository variable `CLOUDFLARE_ACCOUNT_ID`: the account id (not secret).
3. **Environments:** create `development` (deploys only from `dev`) and
   `production` (deploys only from `main`; add yourself as a required
   reviewer if production should wait for your click).

The first deploy of each branch creates its Worker and its custom domain on
the `levuche.com` zone. A new domain's certificate can take a few minutes.

## Keep the dev app private

`app-dev.levuche.com` and the preview links are for the team. Put them behind
Cloudflare Access (Zero Trust > Access > Applications), as for the website's
dev site. For the smoke test and preview tests to see past it, add an Access
service token as the repository secrets `CF_ACCESS_CLIENT_ID` and
`CF_ACCESS_CLIENT_SECRET`; without them the checks only confirm that Access
asks for sign-in.

## Runtime secrets

The sign-in client's secret, from the Buildbase console, is set on each
Worker, never in the repo or GitHub ([AUTH.md](AUTH.md)):

```sh
npx wrangler secret put BUILDBASE_CLIENT_SECRET --env dev
npx wrangler secret put BUILDBASE_CLIENT_SECRET
```

## Deploying again

**Actions** > **Deploy to Cloudflare** > **Run workflow**, then pick `dev` or
`main`.
