# Sign-in

The app signs creators in with Buildbase. levuche.com and the app share one
session: signing in on either site signs you in on both, and signing out on
either ends it on both.

## How it works

1. A signed-out visitor opens any app page. `requireUser()` finds no valid
   session and calls Next.js's `unauthorized()`, so the visitor gets the
   sign-in screen (`src/app/unauthorized.tsx`) with a 401, at the same
   address. Nothing the page renders reaches them.
2. **Sign in** sends them to Buildbase's hosted page, which signs them in or
   creates their account.
3. Buildbase sends them back to the app with a one-time code. The browser
   posts it to `/api/auth/token`, which trades it for a session with the
   client secret and keeps the session in an httpOnly cookie.
4. The app refreshes and shows the page they first asked for.

The cookie is named and set by `@levuche/kit` (`bb-session-id`, or
`bb-session-id-<environment>` for a development environment) with
`Domain=levuche.com`, so levuche.com, dev.levuche.com, app.levuche.com and
app-dev.levuche.com all read it. Every request checks the session with
Buildbase on the server (`getUser()`, once per request); the cookie alone is
never trusted.

| Piece                                       | File                                                        |
| ------------------------------------------- | ----------------------------------------------------------- |
| Settings from the env                       | `src/lib/buildbase-config.ts`                               |
| Server client, `getUser()`, `requireUser()` | `src/lib/buildbase.ts`                                      |
| Code exchange, session, sign-out            | `src/app/api/auth/*/route.ts`                               |
| Cookie writing                              | `src/lib/session-cookie.ts`                                 |
| 20 tries a minute per address               | `src/lib/rate-limit.ts`, `AUTH_LIMITER` in `wrangler.jsonc` |
| Browser side, referrals                     | `src/components/buildbase-provider.tsx`                     |
| Sign-in button                              | `src/components/sign-in.tsx`                                |
| Account menu, sign-out                      | `src/components/account-menu.tsx`                           |

## Writing a page or server function

Call `requireUser()` in every page, layout and server function that shows or
changes a creator's things, even under a layout that already calls it: a
layout and its page render side by side, so a check in the layout alone
doesn't stop the page. It's cached for the request, so the second call costs
nothing.

```tsx
export default async function Sites() {
  const user = await requireUser();
  // read only this creator's things, by user.id
}
```

Use `getUser()` only where a signed-out visitor is fine, and handle `null`.

## Settings

| Name                                 | Where                                                                                 | Value                                                         |
| ------------------------------------ | ------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `NEXT_PUBLIC_BUILDBASE_ORG_ID`       | repository variable `BUILDBASE_ORG_ID`                                                | The org id from the Buildbase console                         |
| `NEXT_PUBLIC_BUILDBASE_ENVIRONMENT`  | repository variable `BUILDBASE_ENVIRONMENT`                                           | The development environment's key; production leaves it empty |
| `NEXT_PUBLIC_BUILDBASE_CLIENT_ID`    | repository variables `BUILDBASE_CLIENT_ID` (dev) and `BUILDBASE_PRODUCTION_CLIENT_ID` | The app's own sign-in client                                  |
| `NEXT_PUBLIC_BUILDBASE_REDIRECT_URL` | set in the workflows                                                                  | `https://app-dev.levuche.com` or `https://app.levuche.com`    |
| `BUILDBASE_CLIENT_SECRET`            | Worker secret                                                                         | The client's secret ([DEPLOY.md](DEPLOY.md#runtime-secrets))  |

The app's sign-in client is made in the Buildbase console by an owner, in the
same environment, with these redirect URLs:

- development: `https://app-dev.levuche.com` and `http://localhost:3000`
- production: `https://app.levuche.com`

With no settings, the app builds and runs, and every page says sign-in isn't
open on this address yet.

## Preview links and tests

A workers.dev preview link can't read the levuche.com cookie, so it always
shows the sign-in screen, and signing in there lands on app-dev.levuche.com.

The end-to-end tests sign in against a stand-in Buildbase server
(`e2e/mock-buildbase.mjs`, settings in `e2e/e2e.env`), never real accounts:

```sh
npm run e2e:build && npm run e2e
```

On a deployed preview (`E2E_BASE_URL=...`), the sign-in tests are skipped.

## Not behind sign-in

`/preview` shows the creator page layout with sample content only. The
editor's own preview replaces it.
