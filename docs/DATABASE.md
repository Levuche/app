# The database

Buildbase keeps accounts, workspaces, teammates, billing and selling. A
creator's sites, pages, blocks, layouts and published versions live in a
Cloudflare D1 database of the app's own, next to the Workers that serve the
app and, later, the live sites on levuche.page.

## Why D1

The pages have to be read at the edge by every live site, as fast as the
site itself. Buildbase collections were looked at first: they're org-wide,
read with a server token only and hold flat fields, so they don't suit
nested page data that thousands of sites read. D1 runs inside the same
Cloudflare account as the Workers, needs no keys at run time (it's a
binding) and keeps up to 30 days of history for restores.

Only Buildbase ids are stored here (a workspace id, the user id of whoever
published), never names, emails or payment details.

## Databases

| Database          | Used by                                            | Binding |
| ----------------- | -------------------------------------------------- | ------- |
| `levuche-app-dev` | app-dev.levuche.com and every pull request preview | `DB`    |
| `levuche-app`     | app.levuche.com                                    | `DB`    |

Both are in the levuche.com Cloudflare account and bound in
`wrangler.jsonc`. Previews share the dev database, so a pull request's new
migration reaches it only once the pull request is merged.

## Tables

From `migrations/0001_sites_pages_versions.sql`:

| Table      | One row per                                                                          |
| ---------- | ------------------------------------------------------------------------------------ |
| `sites`    | creator site, with its Buildbase workspace, status and live version                  |
| `handles`  | name on levuche.page: a site's current one, an old one held for a while, or reserved |
| `pages`    | page of a site's draft: address, title, order, home, hidden, removed at next publish |
| `blocks`   | block on a page: its @levuche/ui type and settings                                   |
| `layouts`  | page and screen (phone, tablet, desktop): where each block sits on the grid          |
| `versions` | publish: the whole site as published, with a note, who published it and when         |

A site's status is one of `unpublished`, `live`, `offline` (taken down by
the creator), `paused` (by the Levuche team) or `deleted`. Any change to a
page, block or layout moves the site's `draft_changed_at` (by triggers), so
a live site whose draft is newer than its live version shows as "live with
draft changes".

Form entries, short links and reports get their own tables in later
migrations.

## Reading and changing data

Every query goes through `siteStore(db, { workspaceId })` in
`src/lib/db.ts`, with the workspace the signed-in creator is working in.
It only ever sees that workspace's rows: another workspace's site reads as
not found and can't be changed. Don't query the tables by id alone
anywhere else.

`npm test` runs `src/lib/db.test.ts` against a local D1 with every
migration applied, and checks that one workspace can't read or change
another's rows.

## Changing the tables

1. Add a migration, never edit one that has been applied:

   ```sh
   npx wrangler d1 migrations create DB short-name
   ```

2. Write the SQL in the new file, then `npm test`. Pull requests apply all
   migrations to a throwaway local database in CI.
3. Merging applies new migrations to the dev database before the dev app
   deploys; merging into `main` does the same for production
   (`.github/workflows/deploy.yml`). The deploy token needs D1: Edit
   ([DEPLOY.md](DEPLOY.md)).

For `npm run dev`, set up the local database once, and again after a new
migration:

```sh
npx wrangler d1 migrations apply DB --local
```

## Backups and restoring

D1 keeps every change for 30 days on the Workers Paid plan, 7 on Free
(Time Travel). To put a database back to
how it was at a moment in that time, from a machine signed in to the
levuche.com account (`npx wrangler login`):

1. Pick the moment, in UTC, and check it:

   ```sh
   npx wrangler d1 time-travel info levuche-app --timestamp=2026-11-26T10:00:00Z
   ```

2. Restore it (`levuche-app-dev` for dev). This replaces the whole database:

   ```sh
   npx wrangler d1 time-travel restore levuche-app --timestamp=2026-11-26T10:00:00Z
   ```

3. Keep the "previous bookmark" it prints. Restoring with
   `--bookmark=<that bookmark>` undoes the restore.

For a copy outside Cloudflare, export the database:

```sh
npx wrangler d1 export levuche-app --remote --output=levuche-app.sql
```

The export holds creators' content, so keep it somewhere private and delete
it when done.
