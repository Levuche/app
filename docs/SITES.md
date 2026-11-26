# Sites and workspaces

Each creator site is one Buildbase workspace. Buildbase keeps what it's good
at: the site's name and picture, its teammates and their roles, and later
its billing. The app's database keeps the site itself: its handle, status,
pages and versions ([DATABASE.md](DATABASE.md)), under the workspace's id.

A creator can have several sites and switch between them; teammates invited
to a workspace work on that site with the role they were given.

## Addresses

| Address                 | Page                                                                          |
| ----------------------- | ----------------------------------------------------------------------------- |
| `/`                     | No sites: on to `/new`. One site: on to it. More: the list of sites.          |
| `/new`                  | Make a site: its name and its handle on levuche.page.                         |
| `/sites/<workspace id>` | The site's overview: status, link and Copy. "Page not found" for non-members. |

## Making a site

`createSite` (`src/app/(app)/new/actions.ts`) checks the name and the handle
(`src/lib/handle.ts`), makes the Buildbase workspace, then the site, its
handle and its home page in one database batch. If the handle is taken, the
workspace is deleted again, so a workspace never stands without its site.
Buildbase's own refusals become plain messages: a name the creator already
uses (409), or as many sites as the account allows (402, 403).

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
