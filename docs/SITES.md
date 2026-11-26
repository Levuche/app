# Sites and workspaces

Each creator site is one Buildbase workspace. Buildbase keeps what it's good
at: the site's name and picture, its teammates and their roles, and later
its billing. The app's database keeps the site itself: its handle, status,
pages and versions ([DATABASE.md](DATABASE.md)), under the workspace's id.

A creator can have several sites and switch between them; teammates invited
to a workspace work on that site with the role they were given.

## Addresses

| Address                 | Page                                                                       |
| ----------------------- | -------------------------------------------------------------------------- |
| `/`                     | No sites: on to `/new`. One site: on to it. More: the list of sites.       |
| `/new`                  | Make a site: its name and its handle on levuche.page.                      |
| `/sites/<workspace id>` | The site. "Page not found" for anyone who isn't a member of its workspace. |

## Making a site

`createSite` (`src/app/(app)/new/actions.ts`) checks the name and the handle
(`src/lib/handle.ts`), makes the Buildbase workspace, then the site, its
handle and its home page with the starting layout (`src/lib/starter.ts`) in
one database batch. If the handle is taken, the
workspace is deleted again, so a workspace never stands without its site.
Buildbase's own refusals become plain messages: a name the creator already
uses (409), or as many sites as the account allows (402, 403).

### Claiming a handle

A handle is 3 to 30 lowercase letters and numbers with single hyphens
between them. Levuche's own words, words a visitor could take for an
official page, and well-known brands are kept back (`RESERVED_HANDLES` in
`src/lib/handle.ts`); the team can keep more back as `reserved` rows in the
`handles` table. A handle is unique across every site, and stays held for a
while after its site is deleted (a `held` row), so old links never land on
someone else.

As the creator types, the form asks `/api/handles?handle=…` (signed in only)
after a short pause and says whether the address is free, taken or kept
back; for a taken one it offers up to three free names close to it. The
form still works without its script, and `createSite` checks again.

### The starting layout

Every new home page opens with a profile header (named after the site), a
row of social icons and a list of links, in that order. The lists start
empty, so nothing made up can go live: the editor asks for them, and the live
page leaves out a block until it's filled in. Where each block sits on a
phone, a tablet and a desktop comes from the grid's own arrangement until
the creator moves something. More layouts to pick from, colours and fonts
come later (#3).

Buildbase's switcher hides its own "Create workspace" button, so every site
is made through `/new` with a handle.

## Roles and checks

Set up in the Buildbase development environment (Settings > Workspaces);
production needs the same before launch:

| Role   | May                                                        |
| ------ | ---------------------------------------------------------- |
| admin  | everything, including teammates, billing and the site      |
| editor | change the site (`app:site:edit`)                          |
| viewer | look at the site (the role a new teammate gets by default) |

`app:site:edit` is the app's own permission ("Edit the site"). A creator
can have up to 5 sites, and new accounts start with none (no workspace is
made for them).

Every page and server function goes through `src/lib/sites.ts`:

- `listSites()`: the signed-in creator's sites.
- `getSite(workspaceId)`: the site, the creator's role and `can(permission)`,
  asked of Buildbase once per request. Anyone who isn't a member gets
  `notFound()`, the same as for a site that doesn't exist, so site ids can't
  be probed.

A server function that changes a site must check
`can(SITE_EDIT)` itself before it writes, whatever the page showed; the
first ones come with the editor.

## The switcher and settings

`SiteSwitcher` (`src/components/site-switcher.tsx`) is Buildbase's
workspace switcher in the header. Buildbase's current workspace follows the
page, so the switcher marks the open site and Buildbase's settings open for
it; picking another site opens its page. `OpenSiteSettings` opens
Buildbase's screens for the site's name and picture, and its teammates.

When something changes in those screens (a rename, a teammate, a role), the
provider re-renders the server's pages (`handleEvent` in
`src/components/buildbase-provider.tsx`). Buildbase's danger zone is hidden:
taking a site offline and deleting it come with #26, which also frees its
handle.

## Tests

`e2e/sites.spec.ts` makes sites against the stand-in Buildbase server
(`e2e/mock-buildbase.mjs`, where any session starting `e2e-` is a creator of
its own) and a local D1 database: a first site, a taken handle, a site
outside the creator's workspaces, a viewer, and the switcher.
